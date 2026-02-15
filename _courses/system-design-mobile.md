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

A strong framework also means knowing how to signal your seniority through the vocabulary you use. Mid-level engineers say "I'll cache the data." Senior engineers say "I'll use Room as the single source of truth with a stale-while-revalidate pattern — the UI gets instant data from the cache, and a background coroutine fetches fresh data from the network, merges it into Room, and the Flow emission automatically recomposes the UI." The depth of your explanation tells the interviewer exactly where you sit on the experience spectrum. Practice narrating your design decisions out loud before the interview — the mental model is never enough; you need the muscle memory of articulating complex ideas under time pressure.

One technique that consistently works well is to explicitly state your assumptions before making design choices. This turns ambiguity from a liability into an asset. When the interviewer gives you an open-ended prompt, you get to shape the problem by saying "I'll assume we're targeting Android API 26+ with Kotlin, the backend team provides RESTful APIs with cursor-based pagination, and we have a dedicated infrastructure team handling push notifications." These assumptions show that you've worked on real teams and understand that mobile design doesn't exist in a vacuum.

```kotlin
// Framework for structuring interview time
data class InterviewPlan(
    val phase: InterviewPhase,
    val timeAllocation: IntRange,
    val deliverables: List<String>,
)

enum class InterviewPhase { INTRO, REQUIREMENTS, HIGH_LEVEL, DEEP_DIVE, WRAP_UP }

val interviewTimeline = listOf(
    InterviewPlan(
        phase = InterviewPhase.INTRO,
        timeAllocation = 0..1,
        deliverables = listOf("Name", "Current role", "Relevant experience"),
    ),
    InterviewPlan(
        phase = InterviewPhase.REQUIREMENTS,
        timeAllocation = 1..6,
        deliverables = listOf(
            "Functional requirements list",
            "Non-functional requirements",
            "Out-of-scope items",
            "Scale assumptions",
        ),
    ),
    InterviewPlan(
        phase = InterviewPhase.HIGH_LEVEL,
        timeAllocation = 6..25,
        deliverables = listOf(
            "Architecture diagram (boxes and arrows)",
            "Client architecture pattern (MVI)",
            "Networking protocol per feature",
            "Data flow overview",
        ),
    ),
    InterviewPlan(
        phase = InterviewPhase.DEEP_DIVE,
        timeAllocation = 25..40,
        deliverables = listOf(
            "Data model with three-layer separation",
            "Critical component implementation",
            "Edge case handling",
        ),
    ),
    InterviewPlan(
        phase = InterviewPhase.WRAP_UP,
        timeAllocation = 40..45,
        deliverables = listOf(
            "End-to-end data flow walkthrough",
            "Tradeoff summary",
            "Extensions with more time",
        ),
    ),
)
```



#### Interview-Style System Design Breakdown

When an interviewer says "Design a messaging app," here's how you should structure your 45 minutes using the framework above. First 5 minutes: "How many users? Millions. Real-time requirements? Yes, sub-second message delivery. Offline support? Yes, users should be able to read and compose messages offline. Multi-device? Yes, messages should sync across phone and tablet. Media support? Text and images for now, video is out of scope." This establishes the constraints that drive your entire design.

Next 15-20 minutes of high-level design: "I'll use MVI for the client architecture with Room as the single source of truth. WebSocket handles real-time message delivery. REST handles message history pagination. The offline write queue persists unsent messages to Room and drains when connectivity returns. The data model separates network DTOs, Room entities, and domain models." Draw the boxes and arrows: UI → ViewModel → Repository → (Room + WebSocket + REST API).

The deep dive (15-20 minutes) should focus on the most critical component. For a chat app, that's the message delivery pipeline: "When the user sends a message, it gets a client-generated UUID, is inserted into Room with SENDING status, shown immediately in the UI, then sent via WebSocket. The server acknowledges with a server timestamp. The local message updates to SENT. If the WebSocket send fails, the message enters the offline queue."

```kotlin
// Interview walkthrough: Message delivery pipeline
class MessageDeliveryPipeline(
    private val messageDao: MessageDao,
    private val webSocket: ChatWebSocket,
    private val offlineQueue: OfflineWriteQueue,
    private val connectivity: ConnectivityMonitor,
) {
    suspend fun deliver(chatId: String, text: String): DeliveryResult {
        // Step 1: Create with client UUID for offline capability
        val message = MessageEntity(
            messageId = UUID.randomUUID().toString(),
            chatId = chatId,
            text = text,
            senderId = currentUserId(),
            timestamp = System.currentTimeMillis(),
            status = "SENDING",
        )

        // Step 2: Persist locally — UI shows immediately via Room Flow
        messageDao.insert(message)

        // Step 3: Attempt delivery based on connectivity
        return if (connectivity.isCurrentlyConnected()) {
            try {
                val ack = webSocket.sendMessage(message.toPayload())
                messageDao.updateStatus(message.messageId, "SENT")
                messageDao.updateServerTimestamp(message.messageId, ack.serverTimestamp)
                DeliveryResult.Sent(ack.serverTimestamp)
            } catch (e: Exception) {
                offlineQueue.enqueue(WriteOperation.SendMessage(message))
                DeliveryResult.Queued
            }
        } else {
            offlineQueue.enqueue(WriteOperation.SendMessage(message))
            DeliveryResult.Queued
        }
    }
}

sealed class DeliveryResult {
    data class Sent(val serverTimestamp: Long) : DeliveryResult()
    data object Queued : DeliveryResult()
    data class Failed(val error: Throwable) : DeliveryResult()
}
```

The ViewModel is the bridge between the UI and the delivery pipeline. In MVI, every user action becomes a sealed intent, the ViewModel processes it, and the resulting state change drives the UI. Here is how the ChatViewModel handles multiple intent types and exposes a single unified state to the Compose UI layer.

```kotlin
// ViewModel handling intents and delegating to the pipeline
class ChatViewModel(
    private val deliveryPipeline: MessageDeliveryPipeline,
    private val messageRepository: MessageRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ChatScreenState())
    val state: StateFlow<ChatScreenState> = _state.asStateFlow()

    fun processIntent(intent: ChatIntent) {
        when (intent) {
            is ChatIntent.SendMessage -> viewModelScope.launch {
                val result = deliveryPipeline.deliver(
                    chatId = _state.value.currentChatId,
                    text = intent.text,
                )
                when (result) {
                    is DeliveryResult.Failed -> _state.update {
                        it.copy(error = ErrorType.SendFailed(result.error.message))
                    }
                    else -> { /* Room Flow handles UI update */ }
                }
            }
            is ChatIntent.LoadMore -> viewModelScope.launch {
                _state.update { it.copy(isLoadingMore = true) }
                messageRepository.loadOlderMessages(
                    chatId = _state.value.currentChatId,
                    beforeId = intent.beforeMessageId,
                )
                _state.update { it.copy(isLoadingMore = false) }
            }
            is ChatIntent.RetryConnection -> viewModelScope.launch {
                messageRepository.reconnectWebSocket()
            }
        }
    }
}
```

Connectivity monitoring is a critical piece that many candidates forget to design. The app needs to know in real time whether it can reach the server, and it needs to react appropriately — draining the offline queue when connectivity returns, pausing sync attempts when offline, and showing the user an accurate connection status indicator.

```kotlin
// Connectivity monitor using Android's ConnectivityManager callback API
class ConnectivityMonitorImpl(
    private val context: Context,
) : ConnectivityMonitor {

    private val _isConnected = MutableStateFlow(false)
    override val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            _isConnected.value = true
        }

        override fun onLost(network: Network) {
            _isConnected.value = false
        }

        override fun onCapabilitiesChanged(
            network: Network,
            capabilities: NetworkCapabilities,
        ) {
            val hasInternet = capabilities.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_INTERNET,
            )
            val isValidated = capabilities.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_VALIDATED,
            )
            _isConnected.value = hasInternet && isValidated
        }
    }

    fun register() {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
    }

    fun unregister() {
        connectivityManager.unregisterNetworkCallback(networkCallback)
    }

    override fun isCurrentlyConnected(): Boolean = _isConnected.value
}
```

#### Architecture Data Flow Description

The complete data flow for a message send operation traverses these layers in order:

Layer 1 — UI Layer: User types message text in the input field and taps the send button. The Compose UI captures this as a `SendMessage` intent and forwards it to the ViewModel.

Layer 2 — ViewModel Layer: The ViewModel receives the `SendMessage` intent, validates the input (non-empty, within character limit), and calls `repository.sendMessage()`. The ViewModel does not update state directly — Room's reactive Flow handles that.

Layer 3 — Repository Layer: The repository creates a `MessageEntity` with a client-generated UUID and SENDING status, inserts it into Room (triggering a Flow emission that updates the UI), then attempts WebSocket delivery or queues for offline sync.

Layer 4 — Data Source Layer: Room persists the message to SQLite, the WebSocket sends the payload to the server, and on acknowledgment, Room updates the status. The Flow emission from Room automatically propagates the status change to the ViewModel and then to the UI.

#### Common Mistakes

A frequent real-world mistake is treating the interview as a monologue. Candidates design in silence for five minutes, then dump a wall of information on the interviewer. In production teams, you collaborate constantly — the interview simulates that. Pause every few minutes and say "Does this direction make sense? Should I go deeper on the offline queue, or would you like to see the pagination strategy?" This turns the interview into a conversation and lets the interviewer steer you toward what they actually want to evaluate.

Another common mistake is over-engineering the initial design. A candidate designing a chat app might immediately start talking about end-to-end encryption, message threading, reactions, and link previews. The interviewer asked for a messaging app, not Signal. Start with the simplest version that satisfies the core requirements — one-to-one text messaging with delivery status — and only add complexity when the interviewer asks for it or when you've finished the core design with time to spare.

A third mistake is ignoring process death and configuration changes. Many candidates design their state management as if the ViewModel lives forever. In reality, Android kills your process when memory is low. If your chat screen state lives only in a ViewModel's MutableStateFlow, the user loses their scroll position, draft message text, and any pending UI state when they return from a phone call. Always mention SavedStateHandle for transient UI state and Room for persistent data as your dual safety net against process death.



**Key takeaway:** Mobile system design interviews test your structured thinking and tradeoff communication, not your ability to recite architecture patterns. A clear framework beats deep knowledge of any single pattern.

### Lesson 1.2: Requirements Gathering

After the introduction, start with requirements gathering by asking questions. But be careful — don't ask for solutions. Ask for constraints and then propose solutions yourself. The interviewer wants to see your thought process, not hear you ask "should I use MVVM or MVI?" Information gathering breaks down into four areas: functional requirements, non-functional requirements, out-of-scope items, and resource constraints.

Functional requirements are the features directly visible to the user. For a messaging app, these might include scrolling through a conversation list, sending and receiving text messages in real-time, sending attachments, deleting or editing sent messages, and seeing read receipts. For a food delivery app, the functional requirements shift entirely — browsing restaurants, customizing orders, tracking delivery on a map, rating past orders. The key insight is that functional requirements drive your entire architecture. A messaging app with real-time sync needs a fundamentally different networking layer than a food delivery app that mostly does request-response.

Non-functional requirements are the qualities that make the app reliable and performant — offline support, real-time sync needs, low latency expectations, battery optimization, and scalability. These aren't features the user directly interacts with, but they feel the absence immediately. Don't skip resource constraints either. Ask about team size — building for a 3-person team versus a 50-person team changes whether you modularize aggressively or keep things simple. Ask about target regions — if you're targeting areas with spotty internet like rural India, you need an offline-first architecture with minimal API calls.

Always explicitly state what's out of scope. In a 45-minute interview you can't design everything. Saying "I'll consider crash reporting and analytics out of scope for this discussion, but I'd use Firebase Crashlytics and a custom analytics SDK in production" shows maturity. It tells the interviewer you know these things exist but you're making a conscious tradeoff about where to spend your limited time.

The order in which you gather requirements also matters. Start with functional requirements because they determine the scope of the design. Then move to non-functional requirements because they shape the architecture — an app that needs to work offline requires a fundamentally different data layer than one that always assumes connectivity. Then discuss scale because it influences your technology choices — paginating a list of 100 items is trivial, but paginating a list of 100,000 items with real-time updates requires RemoteMediator and careful key management. Finally, state what's out of scope to set boundaries and prevent scope creep during the interview.

One technique that experienced candidates use is to categorize each functional requirement by its data flow pattern. A "view conversation list" requirement is a read-heavy paginated flow. A "send message" requirement is a write-with-optimistic-update flow. A "typing indicator" requirement is a real-time ephemeral flow that doesn't need persistence. Categorizing requirements this way immediately tells you which networking protocol, caching strategy, and state management approach each feature needs — before you've drawn a single box on the whiteboard.

```kotlin
// Categorizing requirements by data flow pattern
enum class DataFlowPattern {
    READ_PAGINATED,       // Conversation list, order history
    READ_SINGLE,          // User profile, restaurant detail
    WRITE_OPTIMISTIC,     // Send message, add to cart
    WRITE_CONFIRMED,      // Place order, make payment
    REAL_TIME_PERSISTENT, // Chat messages, delivery tracking
    REAL_TIME_EPHEMERAL,  // Typing indicators, online status
}

data class FeatureRequirement(
    val feature: String,
    val dataFlowPattern: DataFlowPattern,
    val networkProtocol: String,
    val cacheNeeded: Boolean,
    val offlineBehavior: String,
)

val chatFeatures = listOf(
    FeatureRequirement(
        feature = "Conversation list",
        dataFlowPattern = DataFlowPattern.READ_PAGINATED,
        networkProtocol = "REST with cursor pagination",
        cacheNeeded = true,
        offlineBehavior = "Show cached conversations",
    ),
    FeatureRequirement(
        feature = "Send text message",
        dataFlowPattern = DataFlowPattern.WRITE_OPTIMISTIC,
        networkProtocol = "WebSocket",
        cacheNeeded = true,
        offlineBehavior = "Queue in Room, drain when online",
    ),
    FeatureRequirement(
        feature = "Typing indicator",
        dataFlowPattern = DataFlowPattern.REAL_TIME_EPHEMERAL,
        networkProtocol = "WebSocket",
        cacheNeeded = false,
        offlineBehavior = "Not shown when offline",
    ),
    FeatureRequirement(
        feature = "Message read receipts",
        dataFlowPattern = DataFlowPattern.WRITE_CONFIRMED,
        networkProtocol = "WebSocket",
        cacheNeeded = true,
        offlineBehavior = "Queue read events, send when online",
    ),
)
```



#### Interview-Style Requirements Template

Here's a requirements template you can mentally run through for any system design problem. Adapt it to the specific app, but the categories are universal:

```kotlin
// Requirements gathering template for any mobile system design
data class InterviewRequirements(
    // Functional — what the user can do
    val coreFeatures: List<String>,
    val secondaryFeatures: List<String>,

    // Non-functional — quality attributes
    val offlineRequirement: OfflineLevel,
    val latencyTarget: LatencyTarget,
    val dataFreshness: FreshnessRequirement,
    val deviceSupport: DeviceRange,

    // Scale — how big is the data
    val userScale: UserScale,
    val dataVolumePerUser: DataVolume,
    val concurrentUsers: ConcurrentUserEstimate,

    // Out of scope
    val explicitlyOutOfScope: List<String>,
)

enum class OfflineLevel { NONE, READ_ONLY, FULL_READ_WRITE }
enum class LatencyTarget { BEST_EFFORT, SUB_SECOND, REAL_TIME }
enum class FreshnessRequirement { STALE_OK, MINUTES, SECONDS, REAL_TIME }
enum class UserScale { THOUSANDS, MILLIONS, BILLIONS }
enum class DataVolume { SMALL, MEDIUM, LARGE, UNBOUNDED }
enum class ConcurrentUserEstimate { LOW, MEDIUM, HIGH }

// Example: Chat app requirements
val chatRequirements = InterviewRequirements(
    coreFeatures = listOf(
        "Send and receive text messages in real-time",
        "View conversation list with last message preview",
        "Scroll through message history",
    ),
    secondaryFeatures = listOf(
        "Message status indicators (sent, delivered, read)",
        "Typing indicators",
        "Image attachments",
    ),
    offlineRequirement = OfflineLevel.FULL_READ_WRITE,
    latencyTarget = LatencyTarget.REAL_TIME,
    dataFreshness = FreshnessRequirement.REAL_TIME,
    deviceSupport = DeviceRange.LOW_END_INCLUSIVE,
    userScale = UserScale.MILLIONS,
    dataVolumePerUser = DataVolume.LARGE,
    concurrentUsers = ConcurrentUserEstimate.HIGH,
    explicitlyOutOfScope = listOf(
        "Voice/video calls",
        "End-to-end encryption implementation details",
        "Push notification infrastructure",
        "User authentication flow",
    ),
)
```

Here is a second example showing how the same template adapts to a completely different problem domain. Notice how the non-functional requirements shift dramatically — a ride-sharing app cares about real-time location accuracy and battery efficiency far more than a chat app does, while offline support is less critical because you can't hail a ride without connectivity.

```kotlin
// Example: Ride-sharing app requirements
val rideSharingRequirements = InterviewRequirements(
    coreFeatures = listOf(
        "Request a ride with pickup and destination",
        "View nearby available drivers on a map",
        "Track driver location in real-time during ride",
        "View trip summary and fare after ride",
    ),
    secondaryFeatures = listOf(
        "Fare estimate before requesting",
        "Driver rating and feedback",
        "Ride history with receipts",
        "Promo code support",
    ),
    offlineRequirement = OfflineLevel.READ_ONLY,
    latencyTarget = LatencyTarget.REAL_TIME,
    dataFreshness = FreshnessRequirement.SECONDS,
    deviceSupport = DeviceRange.MID_RANGE_AND_UP,
    userScale = UserScale.MILLIONS,
    dataVolumePerUser = DataVolume.MEDIUM,
    concurrentUsers = ConcurrentUserEstimate.HIGH,
    explicitlyOutOfScope = listOf(
        "Driver-side app design",
        "Fare calculation algorithm",
        "Payment gateway integration details",
        "Route optimization engine",
    ),
)
```

Non-functional requirements deserve their own structured analysis because they directly determine your architecture. You can model them as a checklist that produces concrete architectural decisions rather than vague quality attributes.

```kotlin
// Non-functional requirements mapped to architecture decisions
data class NonFunctionalAnalysis(
    val requirement: String,
    val measurableTarget: String,
    val architectureImplication: String,
    val implementationChoice: String,
)

val chatNonFunctionals = listOf(
    NonFunctionalAnalysis(
        requirement = "Offline message composition",
        measurableTarget = "User can compose and queue messages with 0ms perceived latency",
        architectureImplication = "Local-first write path with sync queue",
        implementationChoice = "Room insert → offline queue → WebSocket drain on reconnect",
    ),
    NonFunctionalAnalysis(
        requirement = "Low battery impact",
        measurableTarget = "Less than 3% battery per hour in foreground",
        architectureImplication = "Minimize wake locks, batch network requests",
        implementationChoice = "Single WebSocket connection, coalesced heartbeats every 30s",
    ),
    NonFunctionalAnalysis(
        requirement = "Fast startup",
        measurableTarget = "Conversation list visible in under 500ms cold start",
        architectureImplication = "Cached data shown immediately, no network blocking",
        implementationChoice = "Room query on IO dispatcher, emit cached state before network",
    ),
    NonFunctionalAnalysis(
        requirement = "Low-end device support",
        measurableTarget = "Smooth scrolling on devices with 2GB RAM",
        architectureImplication = "Bounded memory usage, paginated lists, no large bitmaps in memory",
        implementationChoice = "Paging 3 with Room PagingSource, Coil with memory/disk cache limits",
    ),
)
```

#### Common Mistakes

A critical mistake during requirements gathering is not quantifying constraints. "The app should be fast" is useless. "Message delivery should be under 500ms for online users" is actionable. "The app should work offline" is vague. "Users should be able to read all previously synced messages and compose new messages while offline, with automatic sync when connectivity returns" is precise.

Another mistake is confusing requirements with implementation. "We need a WebSocket" is an implementation choice, not a requirement. "We need real-time bidirectional communication with sub-second latency" is a requirement that happens to suggest WebSocket. Always state the requirement first, then derive the implementation.

A third mistake that catches even experienced candidates is forgetting to ask about the user's device landscape. If the interviewer says the app targets emerging markets, that completely changes your memory budget, image loading strategy, and how aggressively you cache. On a device with 2GB of RAM, holding 200 high-resolution avatar bitmaps in an LruCache will push your app into low-memory territory and trigger aggressive garbage collection. Asking "What's the target device profile?" is one question that can reshape your entire design.



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

The reducer is where MVI shines compared to MVVM. In MVVM, you often end up with multiple MutableLiveData or MutableStateFlow fields that can be updated independently, leading to impossible combinations of state. In MVI, the reducer is a pure function that takes the current state and a result from a side effect, and produces a new state. Because it is a pure function with no side effects, it is trivially testable — you pass in a state and a result, and assert on the output. No mocking, no coroutine test dispatchers, no flaky async timing.

```kotlin
// MVI reducer — pure function, trivially testable
class ChatReducer {
    fun reduce(currentState: ChatScreenState, result: ChatResult): ChatScreenState {
        return when (result) {
            is ChatResult.MessagesLoaded -> currentState.copy(
                messages = result.messages,
                isLoading = false,
                hasMoreMessages = result.hasMore,
            )
            is ChatResult.MessageSent -> currentState.copy(
                // No-op: Room Flow handles adding the message to the list
            )
            is ChatResult.LoadingMore -> currentState.copy(
                isLoading = true,
            )
            is ChatResult.Error -> currentState.copy(
                isLoading = false,
                error = result.errorType,
            )
            is ChatResult.TypingStatusChanged -> currentState.copy(
                isUserTyping = result.isTyping,
            )
        }
    }
}

sealed interface ChatResult {
    data class MessagesLoaded(
        val messages: List<MessageItem>,
        val hasMore: Boolean,
    ) : ChatResult
    data object MessageSent : ChatResult
    data object LoadingMore : ChatResult
    data class Error(val errorType: ErrorType) : ChatResult
    data class TypingStatusChanged(val isTyping: Boolean) : ChatResult
}
```

The repository layer is the most critical layer in the high-level design because it orchestrates data from multiple sources and enforces the single source of truth pattern. The repository decides whether to read from cache or network, how to merge remote data with local data, and when to invalidate stale entries. In an offline-first architecture, the repository always reads from Room and triggers network refreshes in the background. The UI never waits for a network call to display data — it shows cached content immediately and seamlessly updates when fresh data arrives through the reactive Flow.

```kotlin
// Repository demonstrating offline-first with Room as SSOT
class ChatRepository(
    private val messageDao: MessageDao,
    private val chatApi: ChatApi,
    private val webSocket: ChatWebSocket,
) {
    // Single source of truth — always reads from Room
    fun getMessages(chatId: String): Flow<List<Message>> {
        return messageDao.observeMessages(chatId)
            .map { entities -> entities.map { it.toDomain() } }
            .onStart { triggerBackgroundSync(chatId) }
    }

    private suspend fun triggerBackgroundSync(chatId: String) {
        try {
            val lastSyncTimestamp = messageDao.getLastSyncTimestamp(chatId)
            val remoteMessages = chatApi.getMessages(
                chatId = chatId,
                since = lastSyncTimestamp,
            )
            messageDao.upsertAll(remoteMessages.map { it.toEntity() })
        } catch (e: Exception) {
            // Sync failure is non-fatal — cached data is still valid
        }
    }

    // Incoming real-time messages go straight to Room
    fun observeIncomingMessages(): Flow<Unit> {
        return webSocket.incomingMessages()
            .map { dto ->
                messageDao.upsert(dto.toEntity())
            }
    }
}
```



#### Architecture Walkthrough Example

Let me trace through a complete high-level architecture for a food delivery app to demonstrate the framework in action.

Client Architecture: MVI with Compose UI → ViewModel → Repository → Data Sources (Room + Retrofit + Memory Cache). The key screens are: restaurant list (paginated, offline-first), restaurant detail (cached, read-heavy), cart (local-first with server sync), order tracking (real-time with SSE), order history (paginated, offline-first).

```kotlin
// High-level architecture as code — food delivery app
sealed interface AppFeature {
    val networkProtocol: String
    val cacheStrategy: String
    val offlineSupport: String

    data object RestaurantList : AppFeature {
        override val networkProtocol = "REST with pagination"
        override val cacheStrategy = "Room SSOT + RemoteMediator"
        override val offlineSupport = "Read-only offline from cache"
    }

    data object Cart : AppFeature {
        override val networkProtocol = "REST with sync"
        override val cacheStrategy = "Room local-first"
        override val offlineSupport = "Full offline — add/remove items locally, sync when online"
    }

    data object OrderTracking : AppFeature {
        override val networkProtocol = "Server-Sent Events"
        override val cacheStrategy = "In-memory only"
        override val offlineSupport = "Show last known state, reconnect automatically"
    }

    data object Checkout : AppFeature {
        override val networkProtocol = "REST with idempotency key"
        override val cacheStrategy = "No cache — always fresh from server"
        override val offlineSupport = "Online only — queue not appropriate for payments"
    }
}
```

The data flow diagram described in layers: the Compose UI layer sits at the top, observing StateFlow from ViewModels. ViewModels sit below, processing intents and calling repositories. Repositories sit in the middle, orchestrating data from multiple sources. At the bottom, three data sources: Room (local persistence), Retrofit (network), and LruCache (in-memory). Arrows flow down for reads (UI → ViewModel → Repository → Data Sources) and up for reactive updates (Room Flow → Repository → ViewModel → UI recomposition).

```kotlin
// ViewModel for restaurant list — demonstrates high-level architecture
class RestaurantListViewModel(
    private val repository: RestaurantRepository,
) : ViewModel() {
    // Paging 3 with RemoteMediator for offline-first pagination
    val restaurants: Flow<PagingData<Restaurant>> = repository.getRestaurants()
        .cachedIn(viewModelScope)

    // State for filters and sorting
    private val _filterState = MutableStateFlow(FilterState())
    val filterState: StateFlow<FilterState> = _filterState.asStateFlow()

    fun applyFilter(cuisine: CuisineType) {
        _filterState.update { it.copy(selectedCuisine = cuisine) }
    }
}
```

When presenting your high-level architecture, explicitly call out the dependency direction. Dependencies should always point inward — the UI depends on the ViewModel, the ViewModel depends on the repository, and the repository depends on data sources. Nothing in the inner layers knows about the outer layers. This is the Dependency Rule from Clean Architecture, and mentioning it by name shows the interviewer you understand why the layers exist, not just that they exist. In Kotlin, this means your repository interface lives in the domain layer and the implementation lives in the data layer, injected via constructor dependency injection.

```kotlin
// Dependency direction: domain defines the contract, data implements it
// Domain layer — no framework dependencies
interface RestaurantRepository {
    fun getRestaurants(): Flow<PagingData<Restaurant>>
    suspend fun getRestaurantDetail(id: String): Restaurant
    suspend fun refreshRestaurants()
}

// Data layer — implements with Room + Retrofit
class RestaurantRepositoryImpl(
    private val restaurantDao: RestaurantDao,
    private val restaurantApi: RestaurantApi,
    private val pagerFactory: RestaurantPagerFactory,
) : RestaurantRepository {

    override fun getRestaurants(): Flow<PagingData<Restaurant>> {
        return pagerFactory.create().flow
            .map { pagingData -> pagingData.map { it.toDomain() } }
    }

    override suspend fun getRestaurantDetail(id: String): Restaurant {
        val cached = restaurantDao.getById(id)
        if (cached != null && !cached.isStale()) return cached.toDomain()

        val remote = restaurantApi.getRestaurant(id)
        restaurantDao.upsert(remote.toEntity())
        return remote.toDomain()
    }

    override suspend fun refreshRestaurants() {
        val remote = restaurantApi.getRestaurants(page = 1)
        restaurantDao.clearAndInsert(remote.map { it.toEntity() })
    }
}
```

#### Design Pitfalls

A common pitfall in high-level design is the "god repository" — a single class that handles all data types. This grows uncontrollably. Instead, create focused repositories: `RestaurantRepository`, `CartRepository`, `OrderRepository`. Each is testable and maintainable.

Another pitfall is skipping the server-side assumptions. Mention what you expect: "The restaurant API supports cursor-based pagination with `nextCursor`, cache headers on static assets, and SSE endpoint for order tracking events."

A third pitfall is choosing an architecture pattern without justifying it. Saying "I'll use MVI" is not enough. You need to explain why MVI fits this particular problem. For a chat app: "MVI's unidirectional data flow prevents the inconsistent state bugs that plague chat UIs — like showing a message as both 'sending' and 'failed' simultaneously. The single state object means I can snapshot the entire screen state for debugging, and the pure reducer makes unit testing the state transitions trivial." This kind of justification demonstrates that you pick tools based on problem fit, not resume keywords.



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

The DAO layer is where your data model meets your actual query patterns. A well-designed DAO exposes exactly the queries your features need — no more, no less. For a chat app, you need to observe messages for a specific conversation in chronological order, find messages by status for the offline queue, and perform bulk upserts when syncing from the server. Each query should be designed with performance in mind: use LIMIT for pagination, avoid SELECT * when you only need a subset of columns, and use @Transaction for operations that span multiple tables.

```kotlin
// DAO with performance-conscious queries
@Dao
interface MessageDao {
    @Query("""
        SELECT * FROM messages 
        WHERE chatId = :chatId 
        ORDER BY timestamp DESC 
        LIMIT :limit OFFSET :offset
    """)
    fun observeMessages(
        chatId: String,
        limit: Int = 50,
        offset: Int = 0,
    ): Flow<List<MessageEntity>>

    @Query("SELECT * FROM messages WHERE status = 'SENDING' OR status = 'QUEUED'")
    suspend fun getPendingMessages(): List<MessageEntity>

    @Query("SELECT MAX(timestamp) FROM messages WHERE chatId = :chatId")
    suspend fun getLastSyncTimestamp(chatId: String): Long?

    @Upsert
    suspend fun upsertAll(messages: List<MessageEntity>)

    @Query("UPDATE messages SET status = :status WHERE messageId = :messageId")
    suspend fun updateStatus(messageId: String, status: String)

    @Query("DELETE FROM messages WHERE chatId = :chatId AND timestamp < :before")
    suspend fun pruneOldMessages(chatId: String, before: Long)
}
```

Room database migrations deserve explicit attention because they are one of the most common sources of production crashes. When you add a column, rename a field, or change an index, you need a migration that transforms the existing schema without losing user data. Auto-migration works for simple cases, but for anything involving data transformation — like splitting a full name column into first and last name — you need a manual migration. Always test migrations against real databases with production-like data volumes, because a migration that works on an empty database can crash on one with 100,000 rows.

```kotlin
// Room database with versioned migrations
@Database(
    entities = [MessageEntity::class, ConversationEntity::class],
    version = 3,
    autoMigrations = [
        AutoMigration(from = 1, to = 2),
    ],
)
abstract class ChatDatabase : RoomDatabase() {
    abstract fun messageDao(): MessageDao
    abstract fun conversationDao(): ConversationDao

    companion object {
        fun build(context: Context): ChatDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                ChatDatabase::class.java,
                "chat.db",
            )
                .addMigrations(MIGRATION_2_3)
                .fallbackToDestructiveMigrationOnDowngrade()
                .build()
        }

        // Manual migration: added composite index for query performance
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE INDEX IF NOT EXISTS index_messages_chatId_timestamp " +
                        "ON messages (chatId, timestamp DESC)"
                )
            }
        }
    }
}
```



#### Complete Architecture Walkthrough — Data Model Layer

Let me show how the three-model pattern works across a complete feature. Consider a social media post with author information, media attachments, and engagement counts.

```kotlin
// Network layer — matches API exactly
@Serializable
data class PostDto(
    @SerialName("post_id") val id: String,
    @SerialName("author") val author: AuthorDto,
    @SerialName("body_text") val bodyText: String,
    @SerialName("media_urls") val mediaUrls: List<String>,
    @SerialName("like_count") val likeCount: Int,
    @SerialName("comment_count") val commentCount: Int,
    @SerialName("is_liked_by_me") val isLikedByMe: Boolean,
    @SerialName("created_at_epoch") val createdAtEpoch: Long,
)

@Serializable
data class AuthorDto(
    @SerialName("user_id") val userId: String,
    @SerialName("display_name") val displayName: String,
    @SerialName("avatar_url") val avatarUrl: String,
)

// Database layer — flattened for Room, indexed for queries
@Entity(
    tableName = "posts",
    indices = [
        Index("createdAt"),
        Index("authorId"),
    ],
)
data class PostEntity(
    @PrimaryKey val postId: String,
    val authorId: String,
    val authorName: String,
    val authorAvatarUrl: String,
    val bodyText: String,
    val mediaUrls: String, // JSON serialized list
    val likeCount: Int,
    val commentCount: Int,
    val isLiked: Boolean,
    val createdAt: Long,
    val lastSyncedAt: Long = System.currentTimeMillis(),
)

// Domain layer — clean Kotlin, typed, framework-free
data class Post(
    val id: String,
    val author: Author,
    val bodyText: String,
    val mediaUrls: List<String>,
    val likeCount: Int,
    val commentCount: Int,
    val isLiked: Boolean,
    val createdAt: Long,
)

data class Author(
    val id: String,
    val displayName: String,
    val avatarUrl: String,
)

// Mappers
fun PostDto.toEntity(): PostEntity = PostEntity(
    postId = id,
    authorId = author.userId,
    authorName = author.displayName,
    authorAvatarUrl = author.avatarUrl,
    bodyText = bodyText,
    mediaUrls = Json.encodeToString(mediaUrls),
    likeCount = likeCount,
    commentCount = commentCount,
    isLiked = isLikedByMe,
    createdAt = createdAtEpoch,
)

fun PostEntity.toDomain(): Post = Post(
    id = postId,
    author = Author(authorId, authorName, authorAvatarUrl),
    bodyText = bodyText,
    mediaUrls = Json.decodeFromString(mediaUrls),
    likeCount = likeCount,
    commentCount = commentCount,
    isLiked = isLiked,
    createdAt = createdAt,
)
```

Notice how the database entity flattens the nested `Author` object — Room handles flat entities much better than nested objects, and it avoids the overhead of a separate authors table with a JOIN for every post query. The domain model restores the nested structure because it's cleaner to work with in business logic and UI code.

Room's TypeConverter is the bridge for storing complex types in SQLite columns. Lists, enums, and custom objects that don't map directly to SQLite's primitive types need converters. Keep converters simple and use kotlinx.serialization for list and map types rather than writing manual parsing logic. Register them at the database level so every DAO benefits from them automatically.

```kotlin
// TypeConverters for complex types stored in Room
class Converters {
    @TypeConverter
    fun fromStringList(value: String): List<String> {
        return Json.decodeFromString(value)
    }

    @TypeConverter
    fun toStringList(list: List<String>): String {
        return Json.encodeToString(list)
    }

    @TypeConverter
    fun fromMessageStatus(status: MessageStatus): String {
        return status.name
    }

    @TypeConverter
    fun toMessageStatus(value: String): MessageStatus {
        return MessageStatus.valueOf(value)
    }

    @TypeConverter
    fun fromTimestamp(value: Long?): Instant? {
        return value?.let { Instant.fromEpochMilliseconds(it) }
    }

    @TypeConverter
    fun toTimestamp(instant: Instant?): Long? {
        return instant?.toEpochMilliseconds()
    }
}

enum class MessageStatus {
    SENDING, QUEUED, SENT, DELIVERED, READ, FAILED
}
```

#### Common Mistakes

A frequently seen mistake is using the same data class for all three layers. When the API renames `body_text` to `content`, you need to update every Composable, every ViewModel, every test that references the field. With separation, you update one mapper and nothing else changes.

Another mistake is over-indexing. Every index speeds up reads but slows down writes because the index must be updated on every insert/update/delete. Only index columns that appear in WHERE clauses of frequently executed queries. Don't index columns that are only used in rare admin queries or one-time migrations.

A third mistake is storing denormalized data without a staleness strategy. If you flatten the author's display name into the PostEntity, what happens when the user changes their name? You now have thousands of posts with the old name. You need either a background job that re-syncs author names periodically, or you normalize the author into a separate table and JOIN at query time. The right choice depends on how often names change versus how often posts are queried — for most social apps, the denormalized approach with periodic sync wins because reads outnumber name changes by orders of magnitude.



**Key takeaway:** Separate network, database, and domain models. This isolation protects your app from API changes and database migrations. Add indexes on columns used in WHERE and ORDER BY clauses from day one.

### Lesson 1.5: Deep Dive — Caching and Networking Strategy

This is where most candidates fall short in interviews. You need to articulate a clear caching strategy, not just say "I'll use Room." Think about it in layers: network cache (OkHttp's built-in cache with Cache-Control headers for static resources), database cache (Room for structured data that needs to survive process death), and in-memory cache (a simple LRU map for things like user profiles that are accessed frequently within a session). The real question is always: what's your source of truth? For an offline-first app, the local database is your source of truth, and the network is just a sync mechanism.

Connection management is the single most impactful thing you can optimize. Most of the time, when someone says "our API calls are slow," the problem isn't bandwidth or payload size — it's connection setup. DNS resolution, TLS handshake, TCP slow start. One shared OkHttpClient instance is the most impactful optimization. OkHttp supports HTTP/2 multiplexing out of the box, meaning multiple requests flow over a single TCP connection simultaneously. If you're creating multiple OkHttpClient instances, each one gets its own connection pool and you lose all reuse.

When discussing networking in an interview, mention the interceptor chain. Application interceptors run first, before OkHttp's internal machinery — they see the original request and fire exactly once. Network interceptors sit between OkHttp's connection logic and the wire — they fire for every network request including redirects. Auth token injection belongs in an application interceptor. Logging and timing belong in a network interceptor. This distinction shows the interviewer you understand OkHttp at a deeper level than just "I call enqueue and get a response."

For retry strategy, mention that OkHttp's `retryOnConnectionFailure` is enabled by default, which can silently retry POST requests. For non-idempotent endpoints like payments or order placement, you need either to disable retries or use a separate client created with `newBuilder()`, which shares the same connection pool but has its own retry policy. Always mention idempotency keys for mutations — the server uses them to deduplicate retried requests.

The OkHttpClient configuration is a place where senior engineers differentiate themselves. A well-configured client handles authentication, caching, logging, and error reporting in its interceptor chain, keeping the actual API call sites clean and focused on business logic. Here is a production-grade OkHttp setup that demonstrates the interceptor ordering, connection pool tuning, and cache configuration you should discuss in an interview.

```kotlin
// Production-grade OkHttpClient configuration
class NetworkModule(
    private val context: Context,
    private val tokenProvider: TokenProvider,
) {
    val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            // Application interceptors — run once per call
            .addInterceptor(AuthInterceptor(tokenProvider))
            .addInterceptor(UserAgentInterceptor())

            // Network interceptors — run per network request
            .addNetworkInterceptor(CacheControlInterceptor())
            .addNetworkInterceptor(
                HttpLoggingInterceptor().apply {
                    level = if (BuildConfig.DEBUG) {
                        HttpLoggingInterceptor.Level.BODY
                    } else {
                        HttpLoggingInterceptor.Level.NONE
                    }
                }
            )

            // Connection pool — reuse connections across requests
            .connectionPool(ConnectionPool(
                maxIdleConnections = 5,
                keepAliveDuration = 30,
                timeUnit = TimeUnit.SECONDS,
            ))

            // Timeouts tuned for mobile networks
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)

            // HTTP cache for static resources
            .cache(Cache(
                directory = File(context.cacheDir, "http_cache"),
                maxSize = 10L * 1024 * 1024, // 10 MB
            ))

            .build()
    }

    // Separate client for payment endpoints — no automatic retries
    val paymentClient: OkHttpClient by lazy {
        okHttpClient.newBuilder()
            .retryOnConnectionFailure(false)
            .build()
    }
}
```

The in-memory cache layer deserves its own discussion because it is often the difference between a snappy app and one that feels sluggish. An LruCache bounded by memory size prevents OOM crashes while keeping frequently accessed data instantly available. The key design decision is choosing the right eviction granularity — cache individual user profiles, not entire API responses, so that a single profile update invalidates one entry instead of an entire page of results.

```kotlin
// Thread-safe in-memory cache with size bounds and TTL
class MemoryCache<K, V>(
    private val maxSize: Int,
    private val ttlMillis: Long = 5 * 60 * 1000L, // 5 minutes default
) {
    private data class CacheEntry<V>(
        val value: V,
        val insertedAt: Long = System.currentTimeMillis(),
    ) {
        fun isExpired(ttlMillis: Long): Boolean {
            return System.currentTimeMillis() - insertedAt > ttlMillis
        }
    }

    private val cache = object : LinkedHashMap<K, CacheEntry<V>>(
        maxSize, 0.75f, true,
    ) {
        override fun removeEldestEntry(
            eldest: MutableMap.MutableEntry<K, CacheEntry<V>>,
        ): Boolean = size > maxSize
    }

    @Synchronized
    fun get(key: K): V? {
        val entry = cache[key] ?: return null
        if (entry.isExpired(ttlMillis)) {
            cache.remove(key)
            return null
        }
        return entry.value
    }

    @Synchronized
    fun put(key: K, value: V) {
        cache[key] = CacheEntry(value)
    }

    @Synchronized
    fun invalidate(key: K) {
        cache.remove(key)
    }

    @Synchronized
    fun invalidateAll() {
        cache.clear()
    }
}
```

The stale-while-revalidate pattern ties together all three cache layers. When the UI requests data, the repository first checks the in-memory cache for an instant hit. If the memory cache misses, it reads from Room and emits that data to the UI immediately. In parallel, it fires a network request to fetch fresh data. When the network response arrives, it updates Room (which triggers a Flow emission) and updates the memory cache. The user sees data instantly and gets fresh data moments later without any loading spinner. This pattern is the gold standard for offline-first apps.

```kotlin
// Stale-while-revalidate pattern combining all cache layers
class UserProfileRepository(
    private val userDao: UserDao,
    private val userApi: UserApi,
    private val memoryCache: MemoryCache<String, UserProfile>,
) {
    fun getUserProfile(userId: String): Flow<UserProfile> = flow {
        // Layer 1: Memory cache — instant, sub-millisecond
        memoryCache.get(userId)?.let { emit(it) }

        // Layer 2: Room — fast, 2-5ms, survives process death
        val cached = userDao.getUser(userId)
        if (cached != null) {
            val domain = cached.toDomain()
            emit(domain)
            memoryCache.put(userId, domain)
        }

        // Layer 3: Network — slow, 100-2000ms, always fresh
        try {
            val remote = userApi.getUser(userId)
            val entity = remote.toEntity()
            userDao.upsert(entity)
            val domain = entity.toDomain()
            memoryCache.put(userId, domain)
            emit(domain)
        } catch (e: Exception) {
            // Network failure is non-fatal if we have cached data
            if (cached == null) throw e
        }
    }.distinctUntilChanged()
}
```



#### Interview-Style Caching Strategy Breakdown

In an interview, present caching as a decision matrix based on data characteristics:

```kotlin
// Caching decision matrix
data class CachingDecision(
    val dataType: String,
    val changeFrequency: String,
    val stalenessTolerance: String,
    val memoryCache: Boolean,
    val diskCache: Boolean,
    val ttl: String,
    val invalidationStrategy: String,
)

val cachingDecisions = listOf(
    CachingDecision(
        dataType = "User Profile",
        changeFrequency = "Rarely (user-initiated)",
        stalenessTolerance = "30 minutes acceptable",
        memoryCache = true,
        diskCache = true,
        ttl = "30 minutes",
        invalidationStrategy = "Event-based (profile update) + TTL fallback",
    ),
    CachingDecision(
        dataType = "Feed Posts",
        changeFrequency = "Constantly (new posts every second)",
        stalenessTolerance = "5 minutes acceptable",
        memoryCache = false,
        diskCache = true,
        ttl = "5 minutes",
        invalidationStrategy = "Pull-to-refresh + periodic background sync",
    ),
    CachingDecision(
        dataType = "Chat Messages",
        changeFrequency = "Created once, never modified",
        stalenessTolerance = "Must be real-time for new messages",
        memoryCache = false,
        diskCache = true,
        ttl = "Never expires",
        invalidationStrategy = "Append-only, no invalidation needed",
    ),
    CachingDecision(
        dataType = "App Configuration",
        changeFrequency = "Very rarely (admin-driven)",
        stalenessTolerance = "1 hour acceptable",
        memoryCache = true,
        diskCache = true,
        ttl = "1 hour",
        invalidationStrategy = "TTL + FCM push for immediate updates",
    ),
)
```

#### Common Mistakes

The most common caching mistake is the "stale cache surprise." A user updates their profile photo, navigates away, comes back, and sees the old photo because the memory cache still holds the previous version. Always invalidate related cache entries when a mutation succeeds. Build cache invalidation into your repository's mutation methods, not as an afterthought.

Another mistake is not considering cache size limits. An unbounded in-memory cache for user avatars will eventually OOM the app. Always use LruCache with a size limit, and estimate your cache size based on the average object size multiplied by the expected number of unique items accessed per session.

A third mistake is ignoring the cold start penalty. If your app relies heavily on Room for offline data but never pre-warms the database query on app launch, the user stares at a blank screen while Room initializes the database file, runs pending migrations, and executes the first query. Pre-warm your critical Room queries in Application.onCreate using a short-lived coroutine scope so that by the time the user reaches the main screen, the data is already in memory and the Flow emits instantly.



**Key takeaway:** Articulate caching in layers (memory, disk, network), connection management strategy (single OkHttpClient, HTTP/2 multiplexing), and retry safety for mutations (idempotency keys, separate client for non-idempotent calls).

### Lesson 1.6: Wrapping Up the Interview

In the last 5 minutes, summarize your design. Walk through the data flow end-to-end: "User opens the chat screen, the ViewModel requests messages from the repository, the repository emits cached data from Room immediately while triggering a network refresh in the background, new messages flow through the WebSocket and are persisted to Room, which updates the UI through the observed Flow." This end-to-end walkthrough demonstrates that your design actually works as a cohesive system, not just a collection of disconnected patterns.

Mention what you'd add with more time — monitoring and crash reporting, analytics events for key user actions, accessibility considerations, deep linking, widget support, CI/CD pipeline with automated UI tests. This shows breadth of thinking without derailing the focused design discussion. If the interviewer asks follow-up questions about scaling, battery optimization, or edge cases, that's a signal you did well — they're stress-testing your design because it's solid enough to be worth probing.

Finally, be honest about tradeoffs. Every design choice has costs. If you chose WebSocket for real-time messages, acknowledge that WebSocket connections consume battery and you'd need to manage connection lifecycle carefully — disconnecting when the app is backgrounded, reconnecting with exponential backoff. If you chose offline-first with Room, acknowledge the complexity of conflict resolution when the same entity is modified on multiple devices. The interviewer isn't looking for a perfect design. They're looking for a candidate who understands that perfection doesn't exist and can articulate why their imperfect design is the right set of tradeoffs for this specific problem.

The tradeoff discussion is where you demonstrate true seniority. Junior engineers present their design as if it has no downsides. Senior engineers proactively surface the weaknesses and explain how they would mitigate them. For every architectural decision, you should be able to state the benefit, the cost, and the alternative you rejected. "I chose Room as the single source of truth because it gives us offline support and survives process death. The cost is slower writes compared to in-memory state — Room's SQLite writes take 1-5ms per row, versus microseconds for an in-memory HashMap. The alternative was keeping state in memory with SavedStateHandle, which is faster but loses data on app uninstall and doesn't support offline." This level of analysis shows the interviewer you've shipped real systems and dealt with real consequences.

When walking through the end-to-end flow, use a structured format that maps each step to a specific component in your architecture. This proves that your boxes-and-arrows diagram is not just decoration — every component has a clear role in the data pipeline. A structured walkthrough also makes it easy for the interviewer to ask targeted follow-up questions about any specific step.

```kotlin
// Structured end-to-end flow for interview wrap-up
data class DataFlowStep(
    val stepNumber: Int,
    val component: String,
    val action: String,
    val dataTransformation: String,
    val failureHandling: String,
)

val messageReceiveFlow = listOf(
    DataFlowStep(
        stepNumber = 1,
        component = "WebSocket",
        action = "Receives incoming message frame from server",
        dataTransformation = "Raw JSON → MessageDto via kotlinx.serialization",
        failureHandling = "Malformed JSON logged and dropped silently",
    ),
    DataFlowStep(
        stepNumber = 2,
        component = "Repository",
        action = "Maps DTO to entity and persists to Room",
        dataTransformation = "MessageDto → MessageEntity via mapper function",
        failureHandling = "Room constraint violation triggers upsert (idempotent)",
    ),
    DataFlowStep(
        stepNumber = 3,
        component = "Room Flow",
        action = "Emits updated message list to all active observers",
        dataTransformation = "List<MessageEntity> emitted to downstream Flows",
        failureHandling = "N/A — Room Flow is lifecycle-aware and conflict-free",
    ),
    DataFlowStep(
        stepNumber = 4,
        component = "ViewModel",
        action = "Receives Flow emission and maps to UI state",
        dataTransformation = "List<MessageEntity> → List<MessageItem> → ChatScreenState",
        failureHandling = "Mapping errors caught and set as state.error",
    ),
    DataFlowStep(
        stepNumber = 5,
        component = "Compose UI",
        action = "Recomposes LazyColumn with updated message list",
        dataTransformation = "ChatScreenState → Composable tree with MessageBubble items",
        failureHandling = "Error state shows retry banner at top of chat",
    ),
)
```



#### Interview-Style Wrap-Up Template

Here's a template for the wrap-up that ensures you cover everything:

```kotlin
// Wrap-up checklist
data class DesignWrapUp(
    val endToEndFlow: String,
    val tradeoffs: List<TradeoffSummary>,
    val extensionsWithMoreTime: List<String>,
    val openQuestions: List<String>,
)

data class TradeoffSummary(
    val decision: String,
    val proReason: String,
    val conReason: String,
)

val chatAppWrapUp = DesignWrapUp(
    endToEndFlow = "User sends message → ViewModel processes intent → " +
        "Repository inserts to Room with SENDING status → UI shows instantly → " +
        "WebSocket delivers to server → Server acks → Room updates to SENT → " +
        "UI shows sent checkmark via Flow",
    tradeoffs = listOf(
        TradeoffSummary(
            decision = "WebSocket over SSE",
            proReason = "Bidirectional — needed for typing indicators and message send",
            conReason = "Higher battery drain, more complex connection management",
        ),
        TradeoffSummary(
            decision = "Room as SSOT over in-memory state",
            proReason = "Survives process death, automatic offline support",
            conReason = "Slower writes than memory, migration complexity",
        ),
    ),
    extensionsWithMoreTime = listOf(
        "End-to-end encryption with Signal Protocol",
        "Message search with FTS (Full-Text Search) in Room",
        "Media compression pipeline for image/video attachments",
        "Read receipts aggregation for group chats",
        "Message reactions with animation",
    ),
    openQuestions = listOf(
        "How to handle message ordering across multiple devices with clock skew?",
        "What's the maximum message size before we need chunked upload?",
        "How do we handle group chats with 500+ members efficiently?",
    ),
)
```

Monitoring and observability should be part of your extensions list because they show that you think about systems in production, not just in development. Mention specific metrics you would track — API latency percentiles, cache hit rates, offline queue depth, WebSocket reconnection frequency. These metrics tell you whether your caching strategy is actually working and whether your offline queue is draining properly.

```kotlin
// Metrics you'd track in production — mention during wrap-up
data class SystemHealthMetrics(
    val metricName: String,
    val measurement: String,
    val alertThreshold: String,
    val actionIfBreached: String,
)

val chatAppMetrics = listOf(
    SystemHealthMetrics(
        metricName = "message_delivery_latency_p99",
        measurement = "Time from send tap to server ack (milliseconds)",
        alertThreshold = "> 2000ms for 5 minutes",
        actionIfBreached = "Check WebSocket connection health, server load",
    ),
    SystemHealthMetrics(
        metricName = "offline_queue_depth",
        measurement = "Number of messages pending delivery in Room",
        alertThreshold = "> 50 messages for any single user",
        actionIfBreached = "Investigate connectivity issues, force queue drain",
    ),
    SystemHealthMetrics(
        metricName = "room_query_latency_avg",
        measurement = "Average time for observeMessages query (milliseconds)",
        alertThreshold = "> 50ms average over 1 hour",
        actionIfBreached = "Check index health, database size, run ANALYZE",
    ),
    SystemHealthMetrics(
        metricName = "cache_hit_rate",
        measurement = "Percentage of user profile requests served from memory cache",
        alertThreshold = "< 60% over 1 hour",
        actionIfBreached = "Review cache TTL, increase cache size, check eviction patterns",
    ),
)
```

The final thirty seconds of your interview should leave a strong closing impression. Summarize your design in one sentence: "I designed a chat app with MVI for predictable state, Room as the single source of truth for offline support, WebSocket for real-time delivery, and an offline queue that guarantees no message is lost." Then offer to go deeper: "I'm happy to dive into any specific component — the conflict resolution strategy, the pagination approach, or the testing strategy for the offline queue." This gives the interviewer a clear signal that you have depth beyond what you've shown and invites them to explore areas they care about.

```kotlin
// One-liner summary builder for your closing statement
data class DesignSummary(
    val appType: String,
    val statePattern: String,
    val dataStrategy: String,
    val networkProtocol: String,
    val keyDifferentiator: String,
) {
    fun toClosingStatement(): String {
        return "I designed a $appType with $statePattern for predictable state, " +
            "$dataStrategy, $networkProtocol for real-time delivery, " +
            "and $keyDifferentiator."
    }
}

val chatSummary = DesignSummary(
    appType = "chat application",
    statePattern = "MVI",
    dataStrategy = "Room as the single source of truth for offline support",
    networkProtocol = "WebSocket",
    keyDifferentiator = "an offline queue that guarantees no message is lost",
)

// Output: "I designed a chat application with MVI for predictable state,
// Room as the single source of truth for offline support,
// WebSocket for real-time delivery,
// and an offline queue that guarantees no message is lost."
```

#### Common Mistakes

The worst wrap-up mistake is not having one. Many candidates spend their last 5 minutes adding minor details to a component instead of stepping back and proving their design works as a whole. The end-to-end walkthrough is more valuable than any individual component detail.

Another mistake is being vague about extensions. Instead of "I'd add analytics," say "I'd add analytics events for message send latency, delivery success rate, and offline queue depth to monitor the health of the messaging pipeline."

A third mistake is failing to acknowledge what you deliberately left out. If you spent the entire deep dive on the message delivery pipeline and never touched pagination, say so: "I focused on the real-time delivery path because that's the hardest part of a chat app. Given more time, I'd design the message history pagination using Paging 3 with a Room PagingSource and cursor-based API pagination, which would give us smooth infinite scroll with offline support." This shows self-awareness and proves you know the gaps in your design are intentional, not accidental.



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

The other major difference is the update cycle. Backend services deploy in minutes. Mobile apps go through app store review, and even after release, users might not update for weeks. This means your API contracts must be backward compatible, your database migrations must handle skipped versions, and your feature flags must account for old clients. You're not designing for one version — you're designing for every version that's ever been released and might still be in the wild. On Android, this translates directly into how you structure your data layer. Your Room database needs a migration strategy that handles users jumping from version 1 to version 5, skipping everything in between.

```kotlin
// Defensive database migration that handles version skipping
@Database(
    entities = [User::class, Post::class, SyncQueue::class],
    version = 5,
)
abstract class AppDatabase : RoomDatabase() {
    companion object {
        fun build(context: Context): AppDatabase {
            return Room.databaseBuilder(context, AppDatabase::class.java, "app.db")
                .addMigrations(
                    MIGRATION_1_2, MIGRATION_2_3,
                    MIGRATION_3_4, MIGRATION_4_5,
                    MIGRATION_1_5, // Skip migration for users jumping versions
                )
                .fallbackToDestructiveMigrationOnDowngrade()
                .build()
        }

        private val MIGRATION_1_5 = object : Migration(1, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Single migration that applies all changes from v1 to v5
                db.execSQL("ALTER TABLE user ADD COLUMN avatar_url TEXT DEFAULT NULL")
                db.execSQL("CREATE TABLE IF NOT EXISTS sync_queue (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL)")
                db.execSQL("CREATE INDEX idx_sync_created ON sync_queue(created_at)")
            }
        }
    }
}
```

Resource constraints also shape architectural decisions differently. On mobile, every byte of memory matters because the OS ranks apps by memory usage and kills the heaviest ones first when memory pressure hits. Every network call consumes battery — not just for data transfer, but for the radio state transition from idle to active, which on cellular networks can add 100-300ms of latency plus significant power draw. Every database operation blocks the calling thread unless you explicitly move it off-main, and even on IO threads, heavy queries during garbage collection can cause UI jank through stop-the-world pauses. This is why mobile architecture tends toward reactive patterns — observe data changes rather than polling, batch network requests rather than firing them individually, and let the system schedule work at optimal times through WorkManager rather than using your own background threads.

```kotlin
// Backend-style thinking: fire network call directly
// This wastes battery with individual radio wakeups
class BackendStyleRepository(private val api: Api) {
    suspend fun refreshProfile() = api.getProfile()
    suspend fun refreshFeed() = api.getFeed()
    suspend fun refreshNotifications() = api.getNotifications()
}

// Mobile-style thinking: batch requests and respect resource constraints
class MobileStyleRepository(
    private val api: Api,
    private val db: AppDatabase,
    private val connectivityMonitor: ConnectivityMonitor,
) {
    fun observeProfile(): Flow<User> = db.userDao().observeCurrentUser()
        .distinctUntilChanged()

    suspend fun syncAll() {
        if (!connectivityMonitor.isConnected()) return
        // Batch multiple requests to minimize radio wakeups
        coroutineScope {
            val profile = async { api.getProfile() }
            val feed = async { api.getFeed() }
            val notifications = async { api.getNotifications() }
            db.withTransaction {
                db.userDao().upsert(profile.await())
                db.feedDao().upsertAll(feed.await())
                db.notificationDao().upsertAll(notifications.await())
            }
        }
    }
}
```

Another fundamental difference is process lifecycle. A backend service starts once and runs until you redeploy it. An Android app can be killed and recreated dozens of times in a single user session — when the user rotates the device, when the OS reclaims memory, when the user navigates away and back. Your architecture must survive process death gracefully. This is why ViewModels exist as a lifecycle-aware layer that outlives Activity recreation, and why SavedStateHandle preserves critical navigation state across process death. Failing to account for process death is one of the most common sources of production crashes in Android apps.

```kotlin
// ViewModel that survives configuration changes AND process death
class SearchViewModel(
    private val savedStateHandle: SavedStateHandle,
    private val repository: SearchRepository,
) : ViewModel() {

    // Survives process death via SavedStateHandle
    private val searchQuery = savedStateHandle.getStateFlow("query", "")

    // Survives config changes via viewModelScope, but NOT process death
    private val _searchResults = MutableStateFlow<List<SearchResult>>(emptyList())

    val uiState: StateFlow<SearchUiState> = combine(
        searchQuery,
        _searchResults,
    ) { query, results ->
        SearchUiState(query = query, results = results)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SearchUiState())

    fun onQueryChanged(query: String) {
        savedStateHandle["query"] = query // Persists across process death
        viewModelScope.launch {
            _searchResults.value = repository.search(query)
        }
    }
}

data class SearchUiState(
    val query: String = "",
    val results: List<SearchResult> = emptyList(),
)
```

Concurrency models differ sharply as well. Backend services use thread pools, connection pools, and horizontal scaling to handle concurrent load. Mobile apps have exactly one main thread that must never block, and structured concurrency through coroutines that must be scoped to lifecycle-aware components. A leaked coroutine on a backend service wastes a thread. A leaked coroutine on mobile can hold references to destroyed Activities, causing memory leaks that accumulate until the app crashes with an OutOfMemoryError. Structured concurrency through `viewModelScope` and `lifecycleScope` ensures that coroutines are cancelled when their parent component is destroyed.

```kotlin
// Lifecycle-aware coroutine scoping prevents leaks
class FeedFragment : Fragment() {

    private val viewModel: FeedViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // This coroutine is automatically cancelled when the view is destroyed
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { state ->
                    renderState(state)
                }
            }
        }
    }

    private fun renderState(state: FeedUiState) {
        // Safe to update UI here — guaranteed to be called
        // only when the view exists and fragment is STARTED
    }
}
```

#### Common Mistakes

The most dangerous mistake is importing backend architectural patterns without adaptation. Engineers coming from backend services often build mobile apps as thin API clients — every screen fetches data from the network, displays it, and discards it. This creates an app that shows blank screens on every launch, feels sluggish on slow connections, and breaks entirely when offline. The fix is treating the local database as the primary data source and the network as a mechanism to keep that database updated.

Another common mistake is ignoring process death during development. The app works perfectly on the developer's device because they never minimize it long enough for the OS to kill it. Then users with lower-end devices start reporting crashes and blank screens after switching between apps. Testing process death requires deliberate effort: use the "Don't keep activities" developer option, or call `adb shell am kill <package>` to simulate the OS killing your app.

A third mistake is treating all data with the same freshness requirements. Engineers often build a single sync mechanism that refreshes everything at the same interval. User profiles, which change rarely, get fetched as often as a live sports score. The result is wasted bandwidth, wasted battery, and unnecessary server load. Map each data type to its actual freshness requirements and sync accordingly.

**Key takeaway:** Mobile system design is fundamentally about designing for unreliable conditions — unreliable networks, limited resources, and users who expect instant responses regardless of circumstances. Embrace constraints instead of fighting them.

### Lesson 2.2: The Architecture Decision Framework

Before building any feature, you need a systematic approach to making architecture decisions. Without a framework, engineers make ad-hoc choices that seem reasonable in isolation but create an inconsistent, hard-to-maintain system over time. The Architecture Decision Framework forces you to think through five dimensions before writing a single line of code: data flow, offline behavior, consistency requirements, scale considerations, and error handling strategy.

Data flow is always the first question: Where does data come from? Where does it go? How often does it change? A user profile changes rarely — cache it aggressively. A stock ticker changes every second — cache it briefly or not at all. A chat message is created once and never modified — append-only storage patterns apply. Understanding the data's lifecycle drives every subsequent decision about caching, persistence, and synchronization. In practice, this means your repository layer should encode data flow characteristics directly. A repository for a read-heavy entity like a user profile looks fundamentally different from one that handles write-heavy data like analytics events.

```kotlin
// Data flow characteristics encoded into repository design
// Read-heavy: aggressive caching, infrequent sync
class UserProfileRepository(
    private val api: UserApi,
    private val dao: UserDao,
    private val cache: LruCache<String, User>,
) {
    private val cacheTtl = 30.minutes

    fun observeProfile(userId: String): Flow<User> {
        return dao.observeUser(userId)
            .onStart { refreshIfStale(userId) }
            .filterNotNull()
    }

    private suspend fun refreshIfStale(userId: String) {
        val lastSync = dao.getLastSyncTime(userId) ?: 0L
        val elapsed = System.currentTimeMillis() - lastSync
        if (elapsed > cacheTtl.inWholeMilliseconds) {
            try {
                val user = api.getUser(userId)
                dao.upsert(user.copy(lastSyncTime = System.currentTimeMillis()))
                cache.put(userId, user)
            } catch (_: IOException) { /* Serve stale data silently */ }
        }
    }
}

// Write-heavy: minimal caching, immediate persistence, queued sync
class AnalyticsRepository(
    private val dao: AnalyticsDao,
    private val syncScheduler: SyncScheduler,
) {
    suspend fun trackEvent(event: AnalyticsEvent) {
        dao.insert(event.copy(syncStatus = SyncStatus.PENDING))
        syncScheduler.scheduleSync() // Batched upload, not immediate
    }
}
```

Offline behavior is the second question: What happens with no network? Partial network? This isn't just about showing a toast that says "No internet connection." It's about defining which features work offline (reading cached messages), which degrade gracefully (showing stale feed data with a timestamp), and which genuinely require connectivity (sending a payment). For each feature, explicitly decide the offline strategy — full offline support, read-only offline, or online-only — and document it. Encoding these strategies into your feature module structure prevents confusion and ensures consistent behavior across the app.

```kotlin
// Offline strategy encoded per feature
sealed interface OfflineCapability {
    data class FullOffline(
        val localDataSource: LocalDataSource,
        val writeQueue: WriteQueue,
    ) : OfflineCapability

    data class ReadOnlyOffline(
        val localDataSource: LocalDataSource,
    ) : OfflineCapability

    data object OnlineOnly : OfflineCapability
}

// Feature registry that documents offline behavior
class FeatureOfflineRegistry {
    private val strategies = mapOf(
        "messaging" to OfflineCapability.FullOffline(
            localDataSource = MessageLocalDataSource(),
            writeQueue = MessageWriteQueue(),
        ),
        "feed" to OfflineCapability.ReadOnlyOffline(
            localDataSource = FeedLocalDataSource(),
        ),
        "payment" to OfflineCapability.OnlineOnly,
    )

    fun canOperateOffline(feature: String): Boolean {
        return strategies[feature] !is OfflineCapability.OnlineOnly
    }

    fun canWriteOffline(feature: String): Boolean {
        return strategies[feature] is OfflineCapability.FullOffline
    }
}
```

Consistency requirements determine your sync strategy: How stale can data be? A social media feed can be 5 minutes old without anyone noticing. An e-commerce inventory count that's 5 minutes old might show items that are already sold out, leading to a frustrating checkout failure. A banking balance must be accurate to the latest transaction. These consistency requirements directly map to your cache TTL, sync frequency, and whether you need real-time push updates. You can formalize consistency requirements as a configuration that drives your sync engine's behavior for each data type.

```kotlin
// Consistency requirements drive sync frequency
data class ConsistencyConfig(
    val dataType: String,
    val maxStaleness: Duration,
    val syncTrigger: SyncTrigger,
    val conflictResolution: ConflictStrategy,
)

enum class SyncTrigger { ON_OPEN, PERIODIC, REAL_TIME, MANUAL }
enum class ConflictStrategy { SERVER_WINS, CLIENT_WINS, LAST_WRITE_WINS, MERGE }

class SyncEngine(private val configs: List<ConsistencyConfig>) {

    suspend fun syncIfNeeded(dataType: String, lastSyncTime: Long) {
        val config = configs.first { it.dataType == dataType }
        val elapsed = (System.currentTimeMillis() - lastSyncTime).milliseconds

        when {
            config.syncTrigger == SyncTrigger.REAL_TIME -> return // Handled by WebSocket
            elapsed > config.maxStaleness -> performSync(dataType, config)
            config.syncTrigger == SyncTrigger.ON_OPEN -> performSync(dataType, config)
        }
    }

    private suspend fun performSync(dataType: String, config: ConsistencyConfig) {
        // Sync implementation that respects conflict resolution strategy
    }
}

// Usage: declare consistency requirements per data type
val consistencyConfigs = listOf(
    ConsistencyConfig("feed", maxStaleness = 5.minutes, SyncTrigger.ON_OPEN, ConflictStrategy.SERVER_WINS),
    ConsistencyConfig("inventory", maxStaleness = 30.seconds, SyncTrigger.PERIODIC, ConflictStrategy.SERVER_WINS),
    ConsistencyConfig("balance", maxStaleness = Duration.ZERO, SyncTrigger.REAL_TIME, ConflictStrategy.SERVER_WINS),
    ConsistencyConfig("draft", maxStaleness = 1.hours, SyncTrigger.MANUAL, ConflictStrategy.LAST_WRITE_WINS),
)
```

Scale and error handling round out the framework. Scale means asking: how many items does this list have? Ten items can be loaded in one API call. Ten thousand items need pagination. A million items need pagination plus search plus local indexing. Error handling means asking: what can fail, how do you detect it, how do you recover, and what does the user see? Every network call can timeout. Every database write can fail if storage is full. Every JSON response can be malformed. Design for these failures upfront, not as afterthoughts. A practical approach is to define error recovery strategies per feature and wire them into a centralized error handler.

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

// Putting the framework into practice: decisions for a messaging app
val messagingDecisions = listOf(
    ArchitectureDecision(
        feature = "conversation_list",
        dataFlow = DataFlowType.READ_HEAVY,
        offlineStrategy = OfflineStrategy.FULL_OFFLINE,
        consistencyRequirement = ConsistencyLevel.NEAR_REAL_TIME,
        expectedScale = ScaleLevel.MEDIUM,
        errorRecovery = ErrorRecoveryStrategy.FALLBACK,
    ),
    ArchitectureDecision(
        feature = "send_message",
        dataFlow = DataFlowType.WRITE_HEAVY,
        offlineStrategy = OfflineStrategy.FULL_OFFLINE,
        consistencyRequirement = ConsistencyLevel.EVENTUAL,
        expectedScale = ScaleLevel.UNBOUNDED,
        errorRecovery = ErrorRecoveryStrategy.QUEUE,
    ),
    ArchitectureDecision(
        feature = "payment",
        dataFlow = DataFlowType.WRITE_HEAVY,
        offlineStrategy = OfflineStrategy.ONLINE_ONLY,
        consistencyRequirement = ConsistencyLevel.STRONG,
        expectedScale = ScaleLevel.SMALL,
        errorRecovery = ErrorRecoveryStrategy.FAIL_FAST,
    ),
)
```

The real power of this framework emerges in system design interviews. When an interviewer asks you to design a feature, walking through these five dimensions systematically shows structured thinking. Instead of jumping into class diagrams, you say: "Let me first understand the data flow — this is read-heavy with occasional writes. Offline, we need read-only support with queued writes. Consistency can be eventual — a 30-second delay is acceptable. Scale is medium — thousands of items, not millions. And errors should fall back to cached data." This three-minute analysis shapes every subsequent decision, and the interviewer sees that you think before you build.

#### Common Mistakes

The most common mistake is skipping the framework entirely and jumping straight into implementation. An engineer says "we need a chat feature" and immediately starts writing WebSocket code. They don't consider offline behavior until a product manager asks "why can't users read old messages on the subway?" They don't consider scale until the app crashes loading a conversation with 50,000 messages. They don't consider error handling until production users report lost messages. The framework exists to surface these questions before a single line of code is written.

Another frequent mistake is applying the same architecture pattern to every feature. Engineers learn MVVM with a repository layer and apply it uniformly — the same caching strategy, the same sync frequency, the same error handling — regardless of whether the feature is a static settings screen or a real-time collaborative editor. Each feature deserves its own architecture decision record because each feature has different characteristics along the five dimensions.

A third mistake is documenting decisions but never revisiting them. Requirements change — a feature that started as online-only gains offline requirements, or a list that started small grows to millions of items. Architecture decisions should be living documents that evolve with the product. Build review checkpoints into your sprint process to reassess whether the original tradeoffs still hold.

Let me walk through the framework with a concrete example: designing a notes app. Data flow: notes are created and edited by the user (write-heavy), read frequently, and synced across devices. Offline behavior: users must create, edit, and delete notes offline. Consistency: eventual consistency is acceptable. Scale: a power user might have 10,000 notes.

From these answers, the architecture crystallizes: Room as SSOT, background sync with WorkManager, Last Write Wins conflict resolution, Paging 3 for the note list, auto-save with debouncing, and delta sync.

Each dimension of the framework influences specific implementation choices. When you identify a feature as write-heavy, you immediately need an offline write queue, optimistic updates, and conflict resolution. When you identify large scale, you need pagination.

Error recovery strategy varies dramatically by feature. A feed refresh that fails should fall back to cached data silently. A message send should be queued for retry. A payment should fail fast.

```kotlin
sealed class RecoveryAction {
    data class ShowCachedData(val staleBanner: Boolean) : RecoveryAction()
    data class QueueForRetry(val maxRetries: Int) : RecoveryAction()
    data class ShowErrorWithRetry(val errorMessage: String) : RecoveryAction()
    data class FailFast(val errorMessage: String) : RecoveryAction()
}

fun recoveryStrategyFor(feature: String): RecoveryAction = when (feature) {
    "feed" -> RecoveryAction.ShowCachedData(staleBanner = true)
    "message_send" -> RecoveryAction.QueueForRetry(maxRetries = 5)
    "search" -> RecoveryAction.ShowErrorWithRetry("Search unavailable")
    "payment" -> RecoveryAction.FailFast("Payment failed. Check connection.")
    else -> RecoveryAction.ShowErrorWithRetry("Something went wrong")
}
```

The framework also helps you communicate tradeoffs. Instead of saying "I chose eventual consistency," say "Given that this is a notes app where users typically edit on one device, eventual consistency is the right tradeoff. It lets me use a simpler pull-based sync instead of CRDTs."

```kotlin
data class ArchitectureDecisionRecord(
    val decision: String,
    val alternatives: List<String>,
    val tradeoffAccepted: String,
)

val noteAppADRs = listOf(
    ArchitectureDecisionRecord("Last Write Wins with server timestamps",
        listOf("CRDTs", "Manual merge UI"), "Rare data loss when concurrent edits happen"),
    ArchitectureDecisionRecord("Pull-based delta sync every 15 minutes",
        listOf("WebSocket real-time", "Push via FCM"), "Up to 15-minute delay for cross-device sync"),
)
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

The request-response pattern is the simplest but still has important nuances on mobile. Unlike backend services that fire HTTP calls and wait, mobile request-response must account for the Activity or Fragment being destroyed while the request is in flight. The request should be scoped to the ViewModel so it survives configuration changes, and the result should be delivered through an observable state holder rather than a callback that might reference a dead view.

```kotlin
// Request-response pattern scoped to ViewModel lifecycle
class CheckoutViewModel(
    private val paymentApi: PaymentApi,
) : ViewModel() {

    private val _paymentState = MutableStateFlow<PaymentState>(PaymentState.Idle)
    val paymentState: StateFlow<PaymentState> = _paymentState.asStateFlow()

    fun submitPayment(order: Order) {
        _paymentState.value = PaymentState.Processing
        viewModelScope.launch {
            _paymentState.value = try {
                val confirmation = paymentApi.charge(order.toPaymentRequest())
                PaymentState.Success(confirmation.transactionId)
            } catch (e: IOException) {
                PaymentState.Error("Network error. Please check your connection.")
            } catch (e: HttpException) {
                when (e.code()) {
                    402 -> PaymentState.Error("Payment declined. Try another card.")
                    409 -> PaymentState.Error("Order already processed.")
                    else -> PaymentState.Error("Something went wrong. Please try again.")
                }
            }
        }
    }
}

sealed interface PaymentState {
    data object Idle : PaymentState
    data object Processing : PaymentState
    data class Success(val transactionId: String) : PaymentState
    data class Error(val message: String) : PaymentState
}
```

The event-driven stream pattern requires careful lifecycle management to avoid resource leaks. A WebSocket connection that stays open when the app is backgrounded wastes battery and data. A connection that closes too aggressively forces frequent reconnections, which are expensive on cellular networks. The sweet spot is tying the connection to a shared scope that stays alive while any subscriber is active, and buffering events during brief disconnections to avoid redundant catch-up API calls.

```kotlin
// Event-driven stream with lifecycle-aware connection management
class ChatRepository(
    private val webSocket: ChatWebSocket,
    private val messageDao: MessageDao,
) {
    // SharedFlow keeps the WebSocket alive while any collector is active
    private val incomingMessages: SharedFlow<ChatEvent> = webSocket.events
        .onEach { event ->
            when (event) {
                is ChatEvent.NewMessage -> messageDao.insert(event.message)
                is ChatEvent.MessageDeleted -> messageDao.delete(event.messageId)
                is ChatEvent.TypingIndicator -> { /* No persistence needed */ }
            }
        }
        .shareIn(
            scope = ProcessLifecycleOwner.get().lifecycleScope,
            started = SharingStarted.WhileSubscribed(stopTimeoutMillis = 30_000),
            replay = 0,
        )

    fun observeMessages(conversationId: String): Flow<List<Message>> {
        return messageDao.observeMessages(conversationId)
            .onStart {
                // Catch up on missed messages since last sync
                val lastTimestamp = messageDao.getLatestTimestamp(conversationId)
                val missed = webSocket.fetchMissedMessages(conversationId, since = lastTimestamp)
                messageDao.upsertAll(missed)
            }
    }
}

sealed interface ChatEvent {
    data class NewMessage(val message: Message) : ChatEvent
    data class MessageDeleted(val messageId: String) : ChatEvent
    data class TypingIndicator(val userId: String, val isTyping: Boolean) : ChatEvent
}
```

Choosing the wrong data flow pattern is one of the most expensive architectural mistakes you can make because it's woven into every layer of the feature — the repository, the ViewModel, the database schema, and the UI. Switching from request-response to event-driven stream after the feature is built means rewriting most of the data layer. The upfront cost of pattern analysis is minutes; the cost of switching patterns mid-development is days or weeks.

```kotlin
// Pattern selection helper — use during architecture design
fun selectDataFlowPattern(requirements: FeatureRequirements): DataFlowPattern {
    return when {
        requirements.isRealTime && requirements.needsBidirectional ->
            DataFlowPattern.EVENT_STREAM
        requirements.needsOfflineWrites ->
            DataFlowPattern.WRITE_BEHIND_QUEUE
        requirements.readToWriteRatio > 10 ->
            DataFlowPattern.READ_THROUGH_CACHE
        else ->
            DataFlowPattern.REQUEST_RESPONSE
    }
}

data class FeatureRequirements(
    val isRealTime: Boolean = false,
    val needsBidirectional: Boolean = false,
    val needsOfflineWrites: Boolean = false,
    val readToWriteRatio: Int = 1,
)

enum class DataFlowPattern {
    READ_THROUGH_CACHE,
    WRITE_BEHIND_QUEUE,
    EVENT_STREAM,
    REQUEST_RESPONSE,
}
```

#### Common Mistakes

The most common mistake is using request-response for data that should be observed reactively. An engineer loads a list of items from the API, displays them, and considers the job done. When the data changes on the server, the user sees stale information until they manually pull-to-refresh. If the feature used a read-through cache pattern with a reactive database observer, the UI would update automatically whenever the local database changed — whether from a background sync, a push notification, or another screen modifying the same data.

Another mistake is building a write-behind queue without idempotency. If the server processes a write but the acknowledgment is lost due to a network timeout, the client retries and the write is applied twice. Every queued write operation needs an idempotency key so the server can detect and deduplicate retries.

A third mistake is mixing patterns within a single data flow. For example, an engineer might use a read-through cache for loading messages but a direct request-response for sending them — without connecting the two. The sent message doesn't appear in the UI until the next cache refresh because the write bypassed the local database that drives the UI. Consistency across the read and write paths is essential: writes should go through the same local database that the read-through cache observes.

Understanding which data flow pattern applies is the first design decision you make, and getting it wrong is expensive to fix later. If you implement a feed with request-response, users see loading spinners constantly. With read-through cache, they see cached content instantly while fresh content loads.

The write-behind queue pattern is more complex than it appears because ordering matters. If the user renames a note and then adds a paragraph, the rename must reach the server before the content update.

```kotlin
class OrderedWriteQueue(private val dao: WriteOperationDao) {
    suspend fun enqueue(operation: WriteOperation) {
        dao.insert(WriteOperationEntity(
            id = UUID.randomUUID().toString(),
            entityId = operation.entityId,
            sequenceNumber = dao.getNextSequence(operation.entityId),
            createdAt = System.currentTimeMillis(),
        ))
    }

    suspend fun drain(): List<DrainResult> {
        val results = mutableListOf<DrainResult>()
        val pending = dao.getPendingOrderedBySequence()
        for (op in pending) {
            try {
                executeOperation(op)
                dao.markCompleted(op.id)
                results.add(DrainResult.Success(op.id))
            } catch (e: Exception) {
                results.add(DrainResult.Failed(op.id, e))
                break
            }
        }
        return results
    }
}
```

The event-driven stream pattern introduces deduplication challenges. When the WebSocket reconnects, the client requests missed events. Some might have been received before disconnection. The client must deduplicate by checking event IDs against Room.

```kotlin
class EventProcessor(private val dao: EventDao) {
    suspend fun processEvent(event: ServerEvent) {
        if (dao.exists(event.id)) return
        dao.recordEvent(EventRecord(eventId = event.id, eventType = event.type))
        handleEvent(event)
        dao.markProcessed(event.id)
    }
}
```

Each pattern also has testing implications. Read-through cache: verify cascade order. Write-behind: verify ordering. Event streams: verify deduplication.

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

One of the biggest advantages of unidirectional data flow is testability. Because state transitions are pure functions — given a current state and an intent, the output state is deterministic — you can test every possible screen scenario without touching the UI, the database, or the network. You create a state, apply an intent, and assert the resulting state. This is dramatically simpler than testing LiveData observers, callback chains, or imperative UI updates.

```kotlin
// Testing state transitions is trivial with UDF
class FeedViewModelTest {

    private lateinit var viewModel: FeedViewModel
    private val fakeRepository = FakeFeedRepository()

    @Before
    fun setup() {
        viewModel = FeedViewModel(fakeRepository)
    }

    @Test
    fun `loading initial feed shows loading then data`() = runTest {
        val posts = listOf(Post(id = "1", title = "Test"))
        fakeRepository.feedResult = flowOf(posts)

        viewModel.handleIntent(FeedIntent.LoadInitial)

        // Verify intermediate loading state
        val states = viewModel.state.take(2).toList()
        assertTrue(states[0].isLoading)
        assertNull(states[0].error)

        // Verify final loaded state
        assertFalse(states[1].isLoading)
        assertEquals(posts, states[1].posts)
    }

    @Test
    fun `like post optimistically updates then rolls back on failure`() = runTest {
        val post = Post(id = "1", title = "Test", isLiked = false, likeCount = 5)
        viewModel = FeedViewModel(fakeRepository)
        // Set initial state with the post
        fakeRepository.feedResult = flowOf(listOf(post))
        viewModel.handleIntent(FeedIntent.LoadInitial)
        advanceUntilIdle()

        fakeRepository.shouldFailLike = true
        viewModel.handleIntent(FeedIntent.LikePost("1"))
        advanceUntilIdle()

        // After rollback, post should be back to original state
        val finalPost = viewModel.state.value.posts.first()
        assertFalse(finalPost.isLiked)
        assertEquals(5, finalPost.likeCount)
    }
}
```

For complex screens with multiple independent sections, a flat state object can become unwieldy. The solution is composing state from smaller, focused state slices that are combined in the ViewModel. Each slice manages its own domain — header state, list state, filter state — and the ViewModel merges them into a single composite state that the UI observes. This keeps each slice simple and testable while maintaining the single-source-of-truth guarantee.

```kotlin
// Composable state slices for a complex screen
data class ProfileHeaderState(
    val user: User? = null,
    val isFollowing: Boolean = false,
    val followerCount: Int = 0,
)

data class ProfilePostsState(
    val posts: List<Post> = emptyList(),
    val isLoading: Boolean = false,
    val hasMore: Boolean = true,
)

data class ProfileFilterState(
    val selectedTab: ProfileTab = ProfileTab.POSTS,
    val sortOrder: SortOrder = SortOrder.NEWEST,
)

enum class ProfileTab { POSTS, REPLIES, MEDIA, LIKES }
enum class SortOrder { NEWEST, OLDEST, POPULAR }

// Composite state that the UI observes
data class ProfileScreenState(
    val header: ProfileHeaderState = ProfileHeaderState(),
    val posts: ProfilePostsState = ProfilePostsState(),
    val filter: ProfileFilterState = ProfileFilterState(),
)

class ProfileViewModel(
    private val userRepository: UserRepository,
    private val postRepository: PostRepository,
) : ViewModel() {

    private val headerState = MutableStateFlow(ProfileHeaderState())
    private val postsState = MutableStateFlow(ProfilePostsState())
    private val filterState = MutableStateFlow(ProfileFilterState())

    val screenState: StateFlow<ProfileScreenState> = combine(
        headerState, postsState, filterState,
    ) { header, posts, filter ->
        ProfileScreenState(header, posts, filter)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ProfileScreenState())

    fun onTabSelected(tab: ProfileTab) {
        filterState.update { it.copy(selectedTab = tab) }
        loadPostsForTab(tab)
    }

    private fun loadPostsForTab(tab: ProfileTab) {
        postsState.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            val posts = postRepository.getPostsByTab(tab)
            postsState.update { it.copy(posts = posts, isLoading = false) }
        }
    }
}
```

One-off events like navigation, showing a snackbar, or triggering a haptic feedback don't fit neatly into a persistent state object. If you put a "show snackbar" flag in state, you need to manually reset it after the UI consumes it, which leads to race conditions and duplicate events. The solution is a separate events channel — a `Channel` or `SharedFlow` with `replay = 0` — that fires events exactly once. State drives what the UI looks like; events drive what the UI does.

```kotlin
class OrderViewModel(
    private val orderRepository: OrderRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(OrderState())
    val state: StateFlow<OrderState> = _state.asStateFlow()

    // One-off events that should not be replayed
    private val _events = Channel<OrderEvent>(Channel.BUFFERED)
    val events: Flow<OrderEvent> = _events.receiveAsFlow()

    fun placeOrder(order: Order) {
        _state.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            try {
                val confirmation = orderRepository.placeOrder(order)
                _state.update { it.copy(isSubmitting = false) }
                _events.send(OrderEvent.NavigateToConfirmation(confirmation.id))
            } catch (e: InsufficientStockException) {
                _state.update { it.copy(isSubmitting = false) }
                _events.send(OrderEvent.ShowSnackbar("Some items are out of stock"))
            } catch (e: IOException) {
                _state.update { it.copy(isSubmitting = false, error = "Network error") }
                _events.send(OrderEvent.ShowSnackbar("Check your connection and try again"))
            }
        }
    }
}

data class OrderState(
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

sealed interface OrderEvent {
    data class NavigateToConfirmation(val orderId: String) : OrderEvent
    data class ShowSnackbar(val message: String) : OrderEvent
    data object HapticFeedback : OrderEvent
}
```

#### Common Mistakes

The most dangerous mistake with unidirectional data flow is mutating state outside the reducer. Engineers new to the pattern sometimes update a `MutableStateFlow` from a callback, a BroadcastReceiver, or a WorkManager result — bypassing the intent-reducer pipeline entirely. This breaks the traceability guarantee and reintroduces the inconsistent state bugs that UDF was designed to prevent. Every state mutation, no matter how small, should flow through the ViewModel's intent handler.

Another common mistake is putting derived data in state instead of computing it. If your state contains both a list of items and an `itemCount` field, they can get out of sync. Instead, compute `itemCount` from the list at render time or expose it as a computed property on the state class. Only store the minimal source data in state; derive everything else.

A third mistake is making state objects too granular — one `StateFlow` per field. This defeats the purpose of a single state object because the UI has to observe multiple flows and combine them manually, recreating the same inconsistency problems. One `StateFlow<ScreenState>` per screen is the principle. If the state class gets large, use composed slices inside a single composite state rather than splitting into independent flows.

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

The ViewModel is where these independent signals are merged into a single observable composite state. Each signal comes from a different source — screen data from the repository, connectivity from a system monitor, sync status from the write queue — and the ViewModel combines them using Kotlin's `combine` operator. This keeps each source independent and testable while giving the UI a single state object to observe.

```kotlin
class InboxViewModel(
    private val messageRepository: MessageRepository,
    private val connectivityMonitor: ConnectivityMonitor,
    private val syncManager: SyncManager,
) : ViewModel() {

    val compositeState: StateFlow<ScreenCompositeState<List<Message>>> = combine(
        messageRepository.observeInbox(),
        connectivityMonitor.observeConnectivity(),
        syncManager.observeSyncState(),
    ) { screenState, connectivity, sync ->
        ScreenCompositeState(
            screenState = screenState,
            connectivity = connectivity,
            sync = sync,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = ScreenCompositeState(
            screenState = ScreenState.Loading,
            connectivity = ConnectivityState(isConnected = true, connectionType = ConnectionType.WIFI),
            sync = SyncState(),
        ),
    )

    fun refresh() {
        viewModelScope.launch {
            messageRepository.refreshInbox()
        }
    }
}
```

Staleness detection is a critical part of offline-first state modeling. The UI should clearly communicate when data might be outdated, but the definition of "stale" varies by feature. A news feed that's 10 minutes old is acceptable; a stock portfolio that's 10 minutes old during trading hours is not. Build staleness thresholds into your state model so the UI can render appropriate warnings — a subtle timestamp for mildly stale data, a prominent banner for severely outdated data, and an automatic refresh trigger when staleness exceeds a critical threshold.

```kotlin
// Staleness-aware state with configurable thresholds
data class StalenessConfig(
    val freshThreshold: Duration = 2.minutes,
    val staleThreshold: Duration = 15.minutes,
    val criticalThreshold: Duration = 1.hours,
)

enum class FreshnessLevel { FRESH, SLIGHTLY_STALE, STALE, CRITICALLY_STALE }

fun <T> ScreenState.Success<T>.freshnessLevel(config: StalenessConfig): FreshnessLevel {
    val age = (System.currentTimeMillis() - lastRefreshed).milliseconds
    return when {
        age <= config.freshThreshold -> FreshnessLevel.FRESH
        age <= config.staleThreshold -> FreshnessLevel.SLIGHTLY_STALE
        age <= config.criticalThreshold -> FreshnessLevel.STALE
        else -> FreshnessLevel.CRITICALLY_STALE
    }
}

// ViewModel auto-refreshes when data crosses critical staleness
class PortfolioViewModel(
    private val portfolioRepository: PortfolioRepository,
    private val connectivityMonitor: ConnectivityMonitor,
) : ViewModel() {

    private val stalenessConfig = StalenessConfig(
        freshThreshold = 30.seconds,
        staleThreshold = 2.minutes,
        criticalThreshold = 5.minutes,
    )

    init {
        viewModelScope.launch {
            // Periodically check staleness and trigger refresh
            while (isActive) {
                delay(30.seconds)
                val current = _screenState.value
                if (current is ScreenState.Success) {
                    val freshness = current.freshnessLevel(stalenessConfig)
                    if (freshness == FreshnessLevel.CRITICALLY_STALE
                        && connectivityMonitor.isConnected()
                    ) {
                        portfolioRepository.refresh()
                    }
                }
            }
        }
    }

    private val _screenState = MutableStateFlow<ScreenState<Portfolio>>(ScreenState.Loading)
    val screenState: StateFlow<ScreenState<Portfolio>> = _screenState.asStateFlow()
}
```

The sync state signal deserves special attention because pending writes directly affect the user's trust in the app. If a user sends a message offline, they need to see that the message is queued and will be delivered when connectivity returns. If a sync fails, they need to know which specific actions failed and whether retry is happening. A well-modeled sync state provides this transparency without overwhelming the user with technical details.

```kotlin
// Granular sync state tracking per pending operation
data class PendingOperation(
    val id: String,
    val type: OperationType,
    val description: String,
    val status: OperationStatus,
    val createdAt: Long,
    val retryCount: Int = 0,
    val lastError: String? = null,
)

enum class OperationType { SEND_MESSAGE, UPDATE_PROFILE, UPLOAD_PHOTO, DELETE_POST }

sealed interface OperationStatus {
    data object Queued : OperationStatus
    data object InProgress : OperationStatus
    data object Completed : OperationStatus
    data class Failed(val isRetryable: Boolean) : OperationStatus
}

class SyncStateTracker(private val syncDao: SyncDao) {

    fun observeSyncState(): Flow<SyncState> {
        return syncDao.observePendingOperations().map { operations ->
            SyncState(
                pendingWrites = operations.count { it.status is OperationStatus.Queued },
                isSyncing = operations.any { it.status is OperationStatus.InProgress },
                lastSyncError = operations
                    .filter { it.status is OperationStatus.Failed }
                    .maxByOrNull { it.createdAt }
                    ?.lastError,
            )
        }
    }

    suspend fun markInProgress(operationId: String) {
        syncDao.updateStatus(operationId, OperationStatus.InProgress)
    }

    suspend fun markCompleted(operationId: String) {
        syncDao.updateStatus(operationId, OperationStatus.Completed)
        syncDao.deleteCompleted() // Clean up after successful sync
    }

    suspend fun markFailed(operationId: String, error: String, isRetryable: Boolean) {
        syncDao.updateOperation(operationId) { op ->
            op.copy(
                status = OperationStatus.Failed(isRetryable),
                lastError = error,
                retryCount = op.retryCount + 1,
            )
        }
    }
}
```

Rendering composite state in Compose becomes straightforward when your state model is well-structured. Each signal maps to a distinct UI element — a banner, a progress indicator, a timestamp — and the composition reads like a declaration of what the screen should look like for any possible combination of data freshness, connectivity, and sync status.

```kotlin
@Composable
fun <T> OfflineAwareScreen(
    compositeState: ScreenCompositeState<T>,
    onRetry: () -> Unit,
    content: @Composable (data: T) -> Unit,
) {
    Column {
        // Connectivity banner
        if (compositeState.shouldShowOfflineBanner) {
            OfflineBanner(connectionType = compositeState.connectivity.connectionType)
        }

        // Sync progress
        if (compositeState.shouldShowSyncProgress) {
            SyncProgressBar(
                pendingCount = compositeState.sync.pendingWrites,
                isSyncing = compositeState.sync.isSyncing,
                error = compositeState.sync.lastSyncError,
            )
        }

        // Main content area
        when (val screenState = compositeState.screenState) {
            is ScreenState.Loading -> LoadingIndicator()
            is ScreenState.Success -> {
                if (compositeState.shouldShowStaleIndicator) {
                    StaleDataBanner(lastRefreshed = screenState.lastRefreshed)
                }
                content(screenState.data)
            }
            is ScreenState.Offline -> {
                StaleDataBanner(lastRefreshed = screenState.lastUpdated)
                content(screenState.staleData)
            }
            is ScreenState.Error -> {
                if (screenState.cachedData != null) {
                    @Suppress("UNCHECKED_CAST")
                    content(screenState.cachedData as T)
                }
                ErrorBanner(message = screenState.exception.message, onRetry = onRetry)
            }
        }
    }
}
```

#### Common Mistakes

The most common mistake is treating offline state as an error state. Engineers display a full-screen error with a "Retry" button when the device is offline, even though the local database has perfectly good cached data to show. Offline is not an error — it's a normal operating condition. The app should show cached data with a subtle offline indicator, not block the user entirely.

Another mistake is forgetting to persist the sync queue across process death. If pending writes are stored only in memory — in a `List` inside a ViewModel or a singleton — they are lost when the OS kills the app. Every pending write must be persisted to the database immediately. The user tapped "send" and saw a confirmation; losing that action silently is a trust-breaking bug.

A third mistake is showing stale timestamps without context. Displaying "Last updated 3 hours ago" means nothing to a user who doesn't know how frequently the data changes. Instead, pair the timestamp with freshness context: "Updated 3 hours ago — prices may have changed" for an e-commerce app, or "Updated 3 hours ago" with no warning for a news feed where staleness is expected and harmless.

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

Without SSOT, you end up in situations where the in-memory cache shows one version of a user profile, the database has another, and the last API response returned a third. The UI might read from any of these depending on timing, screen rotation, or process death recovery. The fix isn't to add synchronization logic between all three sources — it's to eliminate the ambiguity entirely. All reads come from Room. All writes go to Room. The network exists only to keep Room up to date. When a ViewModel needs user data, it collects a Flow from the DAO. When a background sync completes, it writes to Room. The DAO's Flow automatically re-emits, and the UI updates. No event bus, no manual callbacks, no invalidation tokens.

The foundation of SSOT is a well-designed Room layer. Your DAO should expose `Flow` return types for any data the UI observes, and suspend functions for one-shot reads and writes. The `@Upsert` annotation (Room 2.5+) is particularly useful here — it inserts if the row doesn't exist and updates if it does, which is exactly the semantics you need when syncing network data into the local database. Here is a DAO that supports the SSOT pattern for a user entity:

```kotlin
@Dao
interface UserDao {
    @Query("SELECT * FROM users WHERE id = :id")
    fun observeById(id: String): Flow<UserEntity?>

    @Query("SELECT * FROM users WHERE id = :id")
    suspend fun getById(id: String): UserEntity?

    @Upsert
    suspend fun upsert(user: UserEntity)

    @Upsert
    suspend fun upsertAll(users: List<UserEntity>)

    @Query("SELECT COUNT(*) FROM users")
    suspend fun count(): Int

    @Query("DELETE FROM users WHERE id = :id")
    suspend fun deleteById(id: String)
}
```

The implementation pattern is a repository that exposes Flow-based reads from the database and suspend functions for network refresh. The `getUserStream` method below demonstrates the pattern: emit cached data immediately (so the user sees something instantly), trigger a background refresh from the network, and let Room's reactive queries push the updated data to the UI when it arrives. If the network refresh fails and cached data exists, the user sees stale data instead of an error — a much better experience. Notice that the repository constructor takes a `CoroutineDispatcher` parameter, making it testable by swapping in `StandardTestDispatcher`.

```kotlin
class UserRepository(
    private val api: UserApi,
    private val dao: UserDao,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    // Database is the single source of truth — UI observes this
    fun observeUser(id: String): Flow<User> = dao.observeById(id)
        .filterNotNull()
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
        emitAll(dao.observeById(id)
            .filterNotNull()
            .map { Resource.Success(it.toDomain()) })
    }.flowOn(ioDispatcher)
}
```

The key detail that makes this work is Room's invalidation tracking. When you call `dao.upsert()`, Room knows which tables changed and re-executes any active Flow queries on those tables. This means the `observeById` Flow in the last line will automatically emit the freshly written data without any explicit notification. The database change is the notification. This reactive pipeline is what makes the SSOT pattern so powerful — there is zero manual coordination between the write path and the read path.

On the ViewModel side, consuming the SSOT repository is straightforward. You collect the Flow and map it to UI state. The `stateIn` operator converts the cold Flow into a hot `StateFlow` that survives configuration changes when scoped to the ViewModel's lifecycle. The `SharingStarted.WhileSubscribed(5_000)` policy keeps the upstream active for 5 seconds after the last subscriber disappears, covering brief configuration changes like rotation without restarting the database query.

```kotlin
class UserProfileViewModel(
    private val repository: UserRepository,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val userId = savedStateHandle.get<String>("userId")!!

    val uiState: StateFlow<UserProfileUiState> = repository.getUserStream(userId)
        .map { resource ->
            when (resource) {
                is Resource.Loading -> UserProfileUiState.Loading
                is Resource.Success -> UserProfileUiState.Loaded(
                    user = resource.data,
                    isStale = resource.isFromCache,
                )
                is Resource.Error -> UserProfileUiState.Error(resource.exception.message)
            }
        }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5_000),
            initialValue = UserProfileUiState.Loading,
        )

    fun onRefresh() {
        viewModelScope.launch {
            repository.refreshUser(userId)
        }
    }
}
```

When you have related entities — say, a user with their posts — the SSOT pattern scales by using Room's relational queries. You define a data class with `@Embedded` and `@Relation` annotations, and Room handles the JOIN for you. The Flow still auto-updates when either the users table or the posts table changes, so a new post synced from the network automatically appears in the user profile view without any explicit wiring.

```kotlin
data class UserWithPosts(
    @Embedded val user: UserEntity,
    @Relation(
        parentColumn = "id",
        entityColumn = "authorId",
    )
    val posts: List<PostEntity>,
)

@Dao
interface UserDao {
    @Transaction
    @Query("SELECT * FROM users WHERE id = :id")
    fun observeUserWithPosts(id: String): Flow<UserWithPosts?>
}
```

#### Common Mistakes

The most frequent SSOT mistake is bypassing the database for "fresh" data. A developer decides that a particular screen always needs real-time data, so they fetch from the API and emit it directly to the UI without writing it to Room. This creates a second source of truth. When the user navigates away and comes back, the ViewModel re-subscribes to the Room Flow and shows stale data that doesn't match what they just saw. The fix is always the same: write to Room first, read from Room second. Even if you want real-time data, the flow is network → Room → UI, never network → UI.

Another common mistake is forgetting `@Transaction` on relational queries. Without it, Room might read the parent entity and the child entities in separate database operations. If a write happens between those two reads, you get an inconsistent snapshot — a user entity paired with posts that belong to a different version of the data. The `@Transaction` annotation ensures Room reads all related entities within a single database transaction.

A subtler issue is creating multiple DAO Flow subscriptions for the same data across different screens. Each Flow subscription triggers a separate SQLite query when the table is invalidated. If you have 10 screens observing the same user table, every single write triggers 10 queries. The solution is to share the upstream Flow using `shareIn` at the repository level, so a single database query fans out to all subscribers.

**Key takeaway:** Make the local database the only data source the UI reads from. The network exists solely to keep the database fresh. This eliminates data inconsistency bugs and makes offline support automatic.

### Lesson 3.2: The NetworkBoundResource Pattern

The `getUserStream` pattern from the previous lesson works, but it's duplicated across every repository method that needs offline-first behavior. The NetworkBoundResource abstraction extracts this pattern into a reusable flow builder. You provide three functions: how to load from the database, how to fetch from the network, and how to save network results to the database. The abstraction handles the orchestration — cache-first reads, background refresh, error fallback. Without this abstraction, every repository method reimplements the same try-catch-fallback logic, and subtle differences in error handling creep in across the codebase.

This pattern originated from Google's Android architecture samples and has become a standard approach. The key design decision is whether `shouldFetch` returns true or false — this controls when the app makes a network call versus serving purely from cache. You can base this decision on time (data is older than 5 minutes), content (a special "needs refresh" flag), or user action (pull-to-refresh always fetches). The flexibility of this hook is what makes the pattern work across different staleness requirements. A news feed might fetch every time, while a user profile might only fetch if the cache is older than 10 minutes.

The core implementation is a top-level inline function that returns a `Flow<Resource<ResultType>>`. The `inline` and `crossinline` keywords eliminate the overhead of lambda allocations at the call site, which matters because `networkBoundResource` is called on every screen that loads data. The two type parameters — `ResultType` and `RequestType` — exist because the domain model (what the UI sees) often differs from the network model (what the API returns). The `saveFetchResult` function bridges the two by transforming and persisting the network response.

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
```

Using `networkBoundResource` at the repository level transforms each method from a 20-line imperative block into a clean, declarative statement. The repository becomes a configuration file — it declares what to read, where to fetch, and how to save, with zero orchestration logic. The `CachePolicy` object encapsulates staleness rules separately, so changing how often articles refresh doesn't require touching the repository. This separation of concerns is critical in large codebases where multiple developers contribute to the data layer.

```kotlin
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

    fun getArticlesByCategory(category: String) = networkBoundResource(
        query = { dao.observeByCategory(category).map { list -> list.map { it.toDomain() } } },
        fetch = { api.getArticles(category) },
        saveFetchResult = { articles ->
            dao.withTransaction {
                dao.deleteByCategory(category)
                dao.upsertAll(articles.map { it.toEntity() })
            }
        },
        shouldFetch = { it.isNullOrEmpty() || cachePolicy.isExpired("articles_$category") },
        onFetchFailed = { e -> Timber.e(e, "Failed to fetch articles for $category") },
    )
}
```

The `shouldFetch` hook deserves special attention because it determines the app's caching behavior. A time-based cache policy is the most common approach — store the last fetch timestamp and compare it to the current time. However, more sophisticated strategies exist. You can use entity-level ETags so the server returns `304 Not Modified` when nothing has changed, saving bandwidth. You can also use a version number in the API response, where `shouldFetch` compares the local version against a known latest version from a lightweight metadata endpoint.

```kotlin
class CachePolicy(
    private val preferences: SharedPreferences,
    private val defaultMaxAge: Duration = 5.minutes,
) {
    fun isExpired(key: String, maxAge: Duration = defaultMaxAge): Boolean {
        val lastFetch = preferences.getLong("cache_$key", 0L)
        return System.currentTimeMillis() - lastFetch > maxAge.inWholeMilliseconds
    }

    fun markFresh(key: String) {
        preferences.edit { putLong("cache_$key", System.currentTimeMillis()) }
    }

    fun isExpired(lastFetchTime: Long?, maxAge: Duration = defaultMaxAge): Boolean {
        if (lastFetchTime == null) return true
        return System.currentTimeMillis() - lastFetchTime > maxAge.inWholeMilliseconds
    }
}
```

For paginated lists, `networkBoundResource` needs a slight modification. The `saveFetchResult` function must handle whether to replace or append. On the first page, you clear existing data and insert the fresh list. On subsequent pages, you append to the existing data. This is typically controlled by passing a page parameter into the `saveFetchResult` lambda. The Paging 3 library's `RemoteMediator` is essentially a paginated version of `networkBoundResource` — it manages the same cache-first-then-fetch flow but adds page key tracking and boundary callbacks.

```kotlin
fun getArticlesPaged(category: String, page: Int) = networkBoundResource(
    query = { dao.observeByCategory(category).map { list -> list.map { it.toDomain() } } },
    fetch = { api.getArticles(category, page = page) },
    saveFetchResult = { response ->
        dao.withTransaction {
            if (page == 1) dao.deleteByCategory(category)
            dao.upsertAll(response.articles.map { it.toEntity() })
        }
    },
    shouldFetch = { page == 1 && cachePolicy.isExpired("articles_${category}_p1") },
)
```

#### Common Mistakes

The most common mistake is putting business logic inside `networkBoundResource`'s lambda parameters. The `saveFetchResult` function should only persist data — it should not trigger side effects like analytics events, notifications, or navigation. Those belong in the ViewModel or a use case layer. When business logic leaks into `saveFetchResult`, it runs silently on the IO dispatcher with no error handling visible to the caller, creating bugs that are hard to trace.

Another frequent mistake is using `networkBoundResource` for write operations. This abstraction is designed for reads — it assumes the database is the source of truth and the network is a way to refresh it. Write operations have fundamentally different semantics (optimistic updates, conflict resolution, retry queues) and need their own abstraction. Trying to shoehorn a POST request into `networkBoundResource` leads to confused error handling and a flow that doesn't match the write lifecycle.

A subtler issue is forgetting that `query()` is called twice — once before the fetch (to get cached data and decide if fetch is needed) and once after `saveFetchResult` (to observe the fresh data). If your `query` function has side effects or is expensive, this double invocation causes problems. The `query` lambda should always be a simple DAO Flow accessor with no side effects.

**Key takeaway:** Extract the offline-first flow into a reusable `networkBoundResource` abstraction. Each repository method declares what to read, fetch, and save — the orchestration logic is centralized and consistent.

### Lesson 3.3: Offline Write Queue

Reading cached data offline is the easy part. The hard part is handling writes when there's no network. The user taps "send message" or "add to cart" or "update profile" — you need to apply the change locally for instant UI feedback and queue it for server sync when connectivity returns. The offline write queue pattern solves this by persisting pending writes to a Room table and processing them in order when the network becomes available. This pattern is the backbone of apps like email clients, messaging platforms, and collaborative editing tools that must work seamlessly regardless of network conditions.

The queue itself is a Room entity with the write operation type, the serialized payload, a status field (pending, in-progress, completed, failed), a retry count, and timestamps. Persisting to Room instead of an in-memory list is critical — if the user kills the app or the OS kills the process, the pending writes survive. When the app restarts and connectivity is available, the queue resumes processing from where it left off. The entity design should also include a `maxRetries` ceiling and an `errorMessage` field for debugging failed writes after the fact.

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

@Dao
interface PendingWriteDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(write: PendingWriteEntity)

    @Update
    suspend fun update(write: PendingWriteEntity)

    @Query("SELECT * FROM pending_writes WHERE status = 'PENDING' ORDER BY createdAt ASC")
    suspend fun getAllPending(): List<PendingWriteEntity>

    @Query("UPDATE pending_writes SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: String, status: String)

    @Query("UPDATE pending_writes SET status = 'FAILED', errorMessage = :error WHERE id = :id")
    suspend fun markFailed(id: String, error: String)

    @Query("DELETE FROM pending_writes WHERE id = :id")
    suspend fun delete(id: String)

    @Query("SELECT COUNT(*) FROM pending_writes WHERE status = 'PENDING'")
    fun observePendingCount(): Flow<Int>
}
```

Processing the queue requires careful ordering. Writes must be applied in the order they were created — if the user updated their profile name and then updated their avatar, the name change must reach the server before the avatar change. Out-of-order processing can create inconsistencies. Each write is processed atomically: attempt the API call, and if it succeeds, mark the write as completed and remove it from the queue. If it fails with a retryable error (timeout, 5xx), increment the retry count and leave it in the queue. If it fails with a permanent error (4xx, validation failure), mark it as failed and notify the user.

The queue processor itself is a class that observes connectivity and drains the queue whenever the network becomes available. The `flatMapLatest` operator is critical here — if connectivity drops and then reconnects, it cancels any in-progress processing and starts fresh from the first pending write. The `processQueue` method iterates through pending writes sequentially, handling each one atomically. When an `IOException` occurs mid-queue, processing stops entirely because the network is likely down, and the remaining writes should wait for the next connectivity event.

```kotlin
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

For production apps, you should not rely solely on in-process queue processing. If the user closes the app while writes are pending, the in-process Flow stops. WorkManager is the correct tool for ensuring pending writes eventually sync — it survives process death, respects battery optimization, and can be constrained to run only when network is available. The pattern is to schedule a one-time `WorkRequest` whenever a new write is enqueued, and let WorkManager's constraint system handle the timing. The `ExistingWorkPolicy.KEEP` policy ensures you don't schedule duplicate sync workers.

```kotlin
class SyncWorker(
    context: Context,
    params: WorkerParameters,
    private val writeDao: PendingWriteDao,
    private val api: SyncApi,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val pendingWrites = writeDao.getAllPending()
        if (pendingWrites.isEmpty()) return Result.success()

        pendingWrites.forEach { write ->
            try {
                writeDao.updateStatus(write.id, "IN_PROGRESS")
                api.executeWrite(write.operationType, write.payload)
                writeDao.delete(write.id)
            } catch (e: HttpException) {
                if (e.code() in 400..499) {
                    writeDao.markFailed(write.id, e.message())
                } else {
                    return Result.retry()
                }
            } catch (e: IOException) {
                return Result.retry()
            }
        }
        return Result.success()
    }

    companion object {
        fun schedule(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
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

            WorkManager.getInstance(context)
                .enqueueUniqueWork("sync_writes", ExistingWorkPolicy.KEEP, request)
        }
    }
}
```

The repository layer ties everything together by applying the local change immediately and enqueueing the write in a single transaction. The transaction ensures that the local state and the queue are always consistent — you never have a situation where the UI shows the updated state but the write wasn't queued, or vice versa. The pending write count is exposed as a Flow so the UI can show a "syncing" indicator when writes are pending.

```kotlin
class MessageRepository(
    private val db: AppDatabase,
    private val messageDao: MessageDao,
    private val writeQueue: OfflineWriteQueue,
    private val context: Context,
) {
    suspend fun sendMessage(chatId: String, text: String) {
        val message = MessageEntity(
            id = UUID.randomUUID().toString(),
            chatId = chatId,
            text = text,
            status = "PENDING",
            createdAt = System.currentTimeMillis(),
        )

        db.withTransaction {
            messageDao.insert(message)
            writeQueue.enqueue(
                WriteOperation(
                    type = "SEND_MESSAGE",
                    payload = Json.encodeToString(message),
                )
            )
        }

        SyncWorker.schedule(context)
    }

    fun observePendingCount(): Flow<Int> = writeQueue.observePendingCount()
}
```

#### Common Mistakes

The most dangerous mistake is not persisting the write queue to disk. Using an in-memory list or a `Channel` for pending writes means they vanish on process death. The user thinks their message was sent, closes the app, and the message disappears. Always use Room or another persistent storage mechanism for the queue.

Another common mistake is processing writes out of order or in parallel. If write A is "create item" and write B is "update that item," processing B before A produces a server error. Always process the queue sequentially in creation order. Some developers attempt parallelism for performance, but the ordering guarantees are more important than throughput for most mobile apps.

Failing to distinguish between retryable and permanent errors creates infinite retry loops. A `400 Bad Request` will never succeed no matter how many times you retry it. Always check the HTTP status code: 4xx errors should be moved to a dead-letter state immediately, while 5xx and network errors can be retried with exponential backoff. Writes stuck in infinite retry consume battery, generate noise in server logs, and prevent newer writes from being processed.

**Key takeaway:** Persist pending writes to Room so they survive process death. Process writes in order with atomic success/failure handling. Distinguish between retryable errors (5xx, timeout) and permanent failures (4xx) to avoid infinite retry loops.

### Lesson 3.4: Connectivity Monitoring

Reliable connectivity monitoring is the nervous system of an offline-first app. You need to know not just whether the device has a network connection, but whether that connection can actually reach your servers. A device connected to a WiFi captive portal technically has connectivity but can't reach your API. A device on a cellular network might have a connection that's too slow to be useful. Your connectivity monitor should distinguish between these states and expose them as a reactive Flow that the rest of the app can observe. Every other offline-first component — the write queue, the NetworkBoundResource, the sync scheduler — depends on this signal being accurate.

Android's `ConnectivityManager` provides the raw signals via `NetworkCallback`. The callback fires when networks are gained, lost, or their capabilities change. You register for updates and translate the callbacks into a `StateFlow<ConnectivityState>` that any component can collect. The key implementation detail is using `registerDefaultNetworkCallback` (API 24+) rather than registering for specific network types, which gives you the system's currently preferred network. This avoids the common bug of tracking a WiFi network that exists but isn't the active route for traffic.

The connectivity state model should capture more than a simple boolean. You need the connection type (WiFi, cellular, none) for making bandwidth-aware decisions — like downloading high-resolution images only on WiFi. You need the metered flag to avoid expensive syncs on metered connections. And you need a validated flag that indicates whether the network has actually passed Android's internet reachability check, which filters out captive portals and broken connections.

```kotlin
data class ConnectivityState(
    val isConnected: Boolean,
    val connectionType: ConnectionType,
    val isMetered: Boolean = false,
    val isValidated: Boolean = false,
)

enum class ConnectionType { WIFI, CELLULAR, ETHERNET, NONE }

sealed class NetworkEvent {
    data class Connected(val state: ConnectivityState) : NetworkEvent()
    data object Disconnected : NetworkEvent()
    data class CapabilitiesChanged(val state: ConnectivityState) : NetworkEvent()
}
```

The core `ConnectivityMonitor` class wraps `ConnectivityManager` and exposes the state as a `StateFlow`. The `onCapabilitiesChanged` callback is particularly important — it fires when the network's properties change, such as when a WiFi network completes captive portal authentication and gains the `NET_CAPABILITY_VALIDATED` capability. Without observing this callback, you might report "connected" when the device has WiFi but no actual internet access. The `NET_CAPABILITY_VALIDATED` check is what separates a robust connectivity monitor from a naive one.

```kotlin
class ConnectivityMonitor(context: Context) {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val _state = MutableStateFlow(getCurrentState())
    val state: StateFlow<ConnectivityState> = _state.asStateFlow()

    val isConnected: Flow<Boolean> = state
        .map { it.isConnected && it.isValidated }
        .distinctUntilChanged()

    private val _events = MutableSharedFlow<NetworkEvent>(extraBufferCapacity = 10)
    val events: SharedFlow<NetworkEvent> = _events.asSharedFlow()

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            updateState()
            _events.tryEmit(NetworkEvent.Connected(_state.value))
        }

        override fun onLost(network: Network) {
            updateState()
            _events.tryEmit(NetworkEvent.Disconnected)
        }

        override fun onCapabilitiesChanged(
            network: Network,
            capabilities: NetworkCapabilities,
        ) {
            updateState()
            _events.tryEmit(NetworkEvent.CapabilitiesChanged(_state.value))
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
                capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true ->
                    ConnectionType.ETHERNET
                else -> ConnectionType.NONE
            },
            isMetered = capabilities?.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_NOT_METERED
            ) != true,
            isValidated = capabilities?.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_VALIDATED
            ) == true,
        )
    }

    fun cleanup() {
        connectivityManager.unregisterNetworkCallback(networkCallback)
    }
}
```

For a more robust check, complement the system connectivity state with an active server reachability probe. A lightweight HEAD request to your health check endpoint every 30 seconds (only when the system reports connectivity) catches cases where the network is connected but your server is unreachable. This probe should be lightweight — no body, short timeout, no retry — and should run on a background dispatcher to avoid blocking anything. The probe result is combined with the system connectivity state to produce a final `isServerReachable` signal that the write queue and sync components can use with confidence.

```kotlin
class ServerReachabilityProbe(
    private val httpClient: OkHttpClient,
    private val connectivityMonitor: ConnectivityMonitor,
    private val healthCheckUrl: String,
    private val probeInterval: Duration = 30.seconds,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private val _isReachable = MutableStateFlow(false)
    val isReachable: StateFlow<Boolean> = _isReachable.asStateFlow()

    fun startProbing(scope: CoroutineScope) {
        scope.launch(ioDispatcher) {
            connectivityMonitor.isConnected.collectLatest { connected ->
                if (!connected) {
                    _isReachable.value = false
                    return@collectLatest
                }

                while (currentCoroutineContext().isActive) {
                    _isReachable.value = probe()
                    delay(probeInterval)
                }
            }
        }
    }

    private suspend fun probe(): Boolean = withContext(ioDispatcher) {
        try {
            val request = Request.Builder()
                .url(healthCheckUrl)
                .head()
                .build()

            val response = httpClient.newBuilder()
                .callTimeout(5, TimeUnit.SECONDS)
                .build()
                .newCall(request)
                .execute()

            response.isSuccessful
        } catch (e: IOException) {
            false
        }
    }
}
```

On the UI side, the connectivity state drives both visual indicators and behavioral changes. A common pattern is showing a persistent banner when offline and adjusting sync behavior based on connection type. The ViewModel combines the connectivity state with other UI state using `combine`, so changes in connectivity automatically update the screen. This reactive approach ensures the UI always reflects the current network state without polling or manual checks.

```kotlin
class FeedViewModel(
    private val repository: FeedRepository,
    private val connectivityMonitor: ConnectivityMonitor,
) : ViewModel() {

    val uiState: StateFlow<FeedUiState> = combine(
        repository.observeFeed(),
        connectivityMonitor.state,
    ) { articles, connectivity ->
        FeedUiState(
            articles = articles,
            isOffline = !connectivity.isConnected,
            connectionType = connectivity.connectionType,
            showOfflineBanner = !connectivity.isConnected,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = FeedUiState(),
    )

    fun onRefresh() {
        if (connectivityMonitor.state.value.isConnected) {
            viewModelScope.launch { repository.refreshFeed() }
        }
    }
}
```

Lifecycle management of the `ConnectivityMonitor` is crucial. The `NetworkCallback` must be unregistered when it is no longer needed to avoid memory leaks. If the monitor is scoped to the Application class (which is typical for a singleton), it lives for the entire process lifetime and you generally don't need to unregister. But if you scope it to an Activity or Fragment (which you shouldn't for a shared resource), failing to unregister in `onDestroy` leaks the callback and the Context it holds. The recommended approach is to create the monitor as an application-scoped singleton via dependency injection and provide it to any component that needs it.

#### Common Mistakes

The most common mistake is checking connectivity synchronously before making a network call. Code like `if (connectivityManager.activeNetworkInfo?.isConnected == true) { api.fetch() }` has a race condition — the network can drop between the check and the call. Instead, always attempt the network call and handle the `IOException` that results from no connectivity. Use the reactive connectivity state for UI decisions (showing banners, enabling buttons), not for gating API calls.

Another frequent mistake is not calling `unregisterNetworkCallback` when the monitor is no longer needed. Each registered callback holds a reference to its enclosing context. If you create a `ConnectivityMonitor` inside an Activity and never unregister, you leak the entire Activity. The fix is either scoping the monitor to the Application lifecycle (singleton) or explicitly unregistering in the component's teardown.

A subtler issue is treating `onAvailable` as meaning "the internet works." The `onAvailable` callback fires when any network becomes available, including WiFi networks with captive portals. You need to also check `NET_CAPABILITY_VALIDATED` in `onCapabilitiesChanged` to confirm the network actually has internet access. Without this check, your write queue will attempt to process pending writes against a captive portal login page and fail with HTML parsing errors.

**Key takeaway:** Use `ConnectivityManager.NetworkCallback` for reactive connectivity monitoring. Expose state as a `StateFlow` that the rest of the app can observe. Consider supplementing system connectivity with active server reachability probes for robustness.

### Lesson 3.5: Optimistic Updates and Rollback

Optimistic updates are the secret to making offline-first apps feel instant. Instead of waiting for the server to confirm an action before updating the UI, you apply the change locally immediately and assume it will succeed. If the server confirms, great — the local data matches the server. If the server rejects the change, you roll back the local state and notify the user. This pattern is used everywhere: liking a post, sending a message, toggling a setting, adding to a cart. The psychological impact is significant — research shows that perceived latency drops by 200-400ms when the UI responds immediately, which is the difference between an app feeling "snappy" and feeling "sluggish."

The implementation has three steps: save the original state (for potential rollback), apply the optimistic update to the local database, and then attempt the server call. If the server succeeds, update the local state with the server-confirmed version (which might include server-generated fields like timestamps or IDs). If the server fails, restore the original state. The user sees a brief flicker — the change appears, then reverts — which clearly communicates that the action didn't succeed. This three-step dance is the heart of every optimistic update, regardless of how complex the operation is.

The critical detail is saving the original state before the optimistic update. If you don't, you can't roll back. For simple fields like a boolean toggle, rolling back is trivial. For complex operations like reordering a list or applying a batch update, you need to snapshot the entire affected state before the optimistic change. Room transactions make this atomic — the rollback either fully restores the original state or doesn't happen at all. The `OptimisticExecutor` below encapsulates this pattern into a reusable component that any repository can use.

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
```

For more complex scenarios, you need a version of the executor that works with Room transactions and supports batch operations. Consider a drag-to-reorder feature on a list of items. The optimistic update changes the sort order of potentially dozens of items, and the rollback must restore all of them atomically. A Room `@Transaction` ensures that either all items are updated or none are. The snapshot approach below captures the entire affected set before applying the optimistic change, so the rollback can restore every item in a single transaction.

```kotlin
class ListReorderRepository(
    private val db: AppDatabase,
    private val dao: TaskDao,
    private val api: TaskApi,
) {
    suspend fun reorderTasks(
        listId: String,
        fromIndex: Int,
        toIndex: Int,
    ): Result<Unit> {
        // Snapshot original order for rollback
        val originalTasks = dao.getTasksByList(listId)
        val reorderedTasks = originalTasks.toMutableList().apply {
            add(toIndex, removeAt(fromIndex))
        }.mapIndexed { index, task ->
            task.copy(sortOrder = index)
        }

        // Apply optimistic reorder
        db.withTransaction {
            reorderedTasks.forEach { dao.update(it) }
        }

        return try {
            api.reorderTasks(listId, reorderedTasks.map { it.id })
            Result.success(Unit)
        } catch (e: Exception) {
            // Rollback to original order
            db.withTransaction {
                originalTasks.forEach { dao.update(it) }
            }
            Result.failure(e)
        }
    }
}
```

The ViewModel layer is where the user-facing feedback happens. When an optimistic update fails and rolls back, the user needs to know why. A `SnackbarEvent` or similar one-shot UI event communicates the failure without blocking the user's flow. The `SharedFlow` pattern below emits a single event that the UI collects and displays, then discards. The key UX detail is that the rollback is already visible in the UI (because Room's Flow re-emits the restored data), so the snackbar just explains why the change reverted.

```kotlin
class PostDetailViewModel(
    private val repository: PostRepository,
    private val optimisticExecutor: OptimisticExecutor<Post>,
) : ViewModel() {

    private val _events = MutableSharedFlow<UiEvent>()
    val events: SharedFlow<UiEvent> = _events.asSharedFlow()

    fun onLikeClicked(postId: String) {
        viewModelScope.launch {
            val result = optimisticExecutor.execute(
                id = postId,
                optimisticUpdate = { post ->
                    post.copy(
                        isLiked = !post.isLiked,
                        likeCount = if (post.isLiked) post.likeCount - 1 else post.likeCount + 1,
                    )
                },
                networkCall = { post ->
                    if (post.isLiked) api.likePost(post.id) else api.unlikePost(post.id)
                },
            )

            result.onFailure { error ->
                _events.emit(UiEvent.ShowSnackbar("Couldn't update like. Please try again."))
            }
        }
    }

    fun onBookmarkClicked(postId: String) {
        viewModelScope.launch {
            val result = optimisticExecutor.execute(
                id = postId,
                optimisticUpdate = { it.copy(isBookmarked = !it.isBookmarked) },
                networkCall = { post ->
                    if (post.isBookmarked) api.bookmark(post.id) else api.unbookmark(post.id)
                },
            )

            result.onFailure {
                _events.emit(UiEvent.ShowSnackbar("Couldn't update bookmark."))
            }
        }
    }
}
```

When combining optimistic updates with the offline write queue from Lesson 3.3, the pattern changes slightly. Instead of making the network call immediately and rolling back on failure, you apply the optimistic update and enqueue the write. The rollback only happens if the write eventually fails permanently (after exhausting retries). This means the user might not see a rollback for minutes or hours — until the device comes back online and the server rejects the write. For this delayed rollback scenario, a push notification or in-app message is more appropriate than a snackbar.

```kotlin
class OfflineOptimisticRepository(
    private val db: AppDatabase,
    private val dao: PostDao,
    private val writeQueue: OfflineWriteQueue,
    private val context: Context,
) {
    suspend fun toggleLike(postId: String) {
        val original = dao.getById(postId) ?: return

        val updated = original.copy(
            isLiked = !original.isLiked,
            likeCount = if (original.isLiked) original.likeCount - 1 else original.likeCount + 1,
            pendingSync = true,
        )

        db.withTransaction {
            dao.update(updated)
            writeQueue.enqueue(
                WriteOperation(
                    type = if (updated.isLiked) "LIKE_POST" else "UNLIKE_POST",
                    payload = Json.encodeToString(mapOf("postId" to postId)),
                    rollbackData = Json.encodeToString(original),
                )
            )
        }

        SyncWorker.schedule(context)
    }
}
```

#### Common Mistakes

The most common mistake is forgetting to save the original state before applying the optimistic update. Without a snapshot, rollback is impossible. Some developers try to "reverse" the optimistic change (e.g., decrement the like count instead of restoring the original), but this is fragile — if the original count was modified by another concurrent update, the reverse arithmetic produces the wrong value. Always snapshot the complete original state.

Another frequent mistake is not handling the race condition where the user performs multiple optimistic updates on the same entity before the first network call completes. For example, the user rapidly taps the like button twice. The first tap snapshots the original, applies the optimistic like, and starts the network call. The second tap snapshots the optimistic state (which is now "liked"), applies the optimistic unlike, and starts its own network call. If the first call fails and rolls back, it restores the original "unliked" state — but the second call is still in flight with an optimistic "unliked" state. The solution is to debounce rapid interactions or use a mutex to serialize optimistic updates on the same entity.

A subtler issue is applying optimistic updates to data that has server-generated fields. If you optimistically add a comment with a client-generated UUID, and the server returns the same comment with a different ID, created timestamp, and formatted content, the optimistic version and the server version don't match. The `saveFetchResult` step must replace the optimistic entity with the server-confirmed one, not merge them. Use the client-generated UUID as a correlation key, and overwrite the entire entity when the server responds.

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

Mobile apps have three natural cache layers, each with different speed, persistence, and capacity characteristics. The in-memory cache (LruCache or ConcurrentHashMap) provides sub-millisecond reads but is lost on process death and limited by heap size. The disk cache (Room database or DiskLruCache) provides 1-5ms reads, survives process death, and is limited only by device storage. The network layer is the slowest (100ms-5s depending on connectivity) but always has the freshest data. A well-designed app cascades through these layers on read and populates them on write. Understanding the performance profile of each layer is essential to designing a responsive mobile application that works well across varying network conditions.

The cascade pattern works like this: on a read request, check the memory cache first. If it's a hit, return immediately — no disk I/O, no network call. If it's a miss, check the disk cache. If the disk has the data, return it and promote it to the memory cache so subsequent reads are instant. If the disk misses too, fetch from the network, write to both the disk and memory cache, and return to the caller. This cascade means the first read of any item is slow (network), but every subsequent read is fast (memory or disk), even across process death (disk). The promotion step is critical because without it, every read would hit the disk even when the same item was requested moments ago.

The reverse flow — cache population — is equally important. When fresh data arrives from the network, it must flow through all layers. Write to the disk cache first (for persistence), then update the memory cache (for speed). If you update the memory cache but forget the disk cache, the next process restart will show stale data. If you update the disk cache but forget the memory cache, the current session will keep showing stale data until the cache entry expires or is evicted. Both layers must be updated atomically to maintain consistency. In practice, this means your repository method should always write to Room first, then synchronously update the LruCache before returning the result to the caller.

The in-memory layer typically uses Android's `LruCache`, which provides automatic eviction based on a maximum entry count. For simple key-value pairs, you can also use a `ConcurrentHashMap` when you need thread-safe access without LRU eviction semantics. The following example shows a basic memory cache that wraps `LruCache` with a size-based eviction policy:

```kotlin
class MemoryCache<K : Any, V : Any>(maxEntries: Int) {
    private val lruCache = object : LruCache<K, V>(maxEntries) {
        override fun sizeOf(key: K, value: V): Int = 1
    }

    fun get(key: K): V? = lruCache.get(key)

    fun put(key: K, value: V) {
        lruCache.put(key, value)
    }

    fun remove(key: K) {
        lruCache.remove(key)
    }

    fun evictAll() {
        lruCache.evictAll()
    }

    fun snapshot(): Map<K, V> = lruCache.snapshot()
}
```

The disk layer serves as the persistent backbone. Room is the preferred choice for structured data because it supports reactive queries via Flow, handles schema migrations, and integrates cleanly with the rest of the Android architecture. When you read from the disk cache on a miss, you should always promote the result into the memory cache so subsequent reads bypass disk I/O entirely. The following repository demonstrates the full three-layer cascade with Room as the disk layer:

```kotlin
class CachedUserRepository(
    private val api: UserApi,
    private val dao: UserDao,
) {
    private val memoryCache = MemoryCache<String, User>(maxEntries = 200)

    suspend fun getUser(id: String): User {
        // Layer 1: Memory cache (sub-millisecond)
        memoryCache.get(id)?.let { return it }

        // Layer 2: Disk cache via Room (1-5ms)
        dao.getById(id)?.let { entity ->
            val user = entity.toDomain()
            memoryCache.put(id, user)
            return user
        }

        // Layer 3: Network (100ms-5s)
        val networkUser = api.getUser(id)
        dao.upsert(networkUser.toEntity())
        memoryCache.put(id, networkUser)
        return networkUser
    }

    suspend fun refreshUser(id: String): User {
        val fresh = api.getUser(id)
        dao.upsert(fresh.toEntity())
        memoryCache.put(id, fresh)
        return fresh
    }

    fun invalidate(id: String) {
        memoryCache.remove(id)
    }

    fun invalidateAll() {
        memoryCache.evictAll()
    }
}
```

For binary data like images or serialized JSON blobs that do not fit neatly into Room, `DiskLruCache` provides a file-based LRU cache with a configurable maximum size in bytes. Jake Wharton's `DiskLruCache` library is the standard choice and is used internally by OkHttp and Glide. It stores each entry as a file on the filesystem, evicting the least recently used files when the total size exceeds the limit. The following snippet shows how to wrap `DiskLruCache` for caching API response bodies:

```kotlin
class DiskJsonCache(
    cacheDir: File,
    maxSizeBytes: Long = 10L * 1024 * 1024,
) {
    private val diskCache = DiskLruCache.open(
        File(cacheDir, "json_cache"),
        1, // app version
        1, // value count per entry
        maxSizeBytes
    )

    fun get(key: String): String? {
        val snapshot = diskCache.get(key.toSafeKey()) ?: return null
        return snapshot.use { it.getString(0) }
    }

    fun put(key: String, json: String) {
        val editor = diskCache.edit(key.toSafeKey()) ?: return
        try {
            editor.set(0, json)
            editor.commit()
        } catch (e: IOException) {
            editor.abort()
        }
    }

    private fun String.toSafeKey(): String {
        return MessageDigest.getInstance("MD5")
            .digest(toByteArray())
            .joinToString("") { "%02x".format(it) }
    }
}
```

The memory cache size needs careful tuning. Too small and you get frequent cache misses, defeating the purpose. Too large and you consume heap space that could cause OutOfMemoryErrors or increase GC pressure. A good starting point is to estimate the average size of a cached object, multiply by the number of items a typical user accesses in a session, and use that as your LRU cache size. For user profiles, 100-200 entries is usually plenty. For thumbnail metadata, you might need 500-1000. Monitor your cache hit rates in production using a simple counter that increments on hit and miss, then report the ratio as an analytics event. The following Room DAO shows how to define the disk layer with upsert semantics and timestamp tracking:

```kotlin
@Dao
interface UserDao {
    @Query("SELECT * FROM users WHERE id = :id")
    suspend fun getById(id: String): UserEntity?

    @Upsert
    suspend fun upsert(user: UserEntity)

    @Upsert
    suspend fun upsertAll(users: List<UserEntity>)

    @Query("DELETE FROM users WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("SELECT last_fetched_at FROM cache_metadata WHERE entity_type = 'user'")
    suspend fun getLastFetchTimestamp(): Long?

    @Query("INSERT OR REPLACE INTO cache_metadata (entity_type, last_fetched_at) VALUES ('user', :timestamp)")
    suspend fun updateFetchTimestamp(timestamp: Long)
}
```

The cache-aside pattern is the most common integration approach for these three layers. The application code is responsible for checking the cache, fetching from the source on a miss, and populating the cache afterward. This differs from read-through caching where the cache itself fetches on a miss. Cache-aside gives you full control over when and how data enters the cache, which is important on mobile where network calls have battery and bandwidth implications. The following helper encapsulates the cache-aside pattern into a reusable function:

```kotlin
suspend fun <T> cacheAside(
    cacheKey: String,
    memoryCache: MemoryCache<String, T>,
    diskRead: suspend (String) -> T?,
    diskWrite: suspend (String, T) -> Unit,
    networkFetch: suspend () -> T,
): T {
    memoryCache.get(cacheKey)?.let { return it }

    diskRead(cacheKey)?.let { diskValue ->
        memoryCache.put(cacheKey, diskValue)
        return diskValue
    }

    val networkValue = networkFetch()
    diskWrite(cacheKey, networkValue)
    memoryCache.put(cacheKey, networkValue)
    return networkValue
}
```

#### Common Mistakes

One of the most frequent mistakes is forgetting to promote disk cache hits into the memory cache. Without promotion, every read for the same item hits Room, adding unnecessary I/O latency that defeats the purpose of having a memory layer. Another common error is updating the memory cache without also updating the disk cache during a network refresh. This creates a split-brain scenario where the current session shows fresh data, but the next app launch reverts to stale data because Room was never updated.

Developers also often misconfigure LruCache by overriding `sizeOf` incorrectly. If you are caching bitmaps, `sizeOf` should return the byte count of the bitmap, not 1. Returning 1 means the cache treats every bitmap as the same size, which causes larger bitmaps to stay cached while many smaller ones are evicted, leading to unpredictable memory usage. Always match the `sizeOf` implementation to the actual resource cost of the cached item.

Finally, avoid using a single global cache instance for unrelated data types. Mixing user profiles and API tokens in the same LruCache means evicting a user profile could be caused by inserting an unrelated token. Use separate cache instances per domain — one for users, one for products, one for settings — so each cache has its own eviction boundaries and size limits.

The in-memory cache layer deserves special attention because its performance characteristics differ significantly from disk and network. Sub-millisecond reads from memory mean hot data is effectively free to read. This makes the memory cache ideal for data accessed repeatedly in quick succession.

Capacity planning for each layer requires different thinking. The memory cache is limited by the app's heap — using more than 12-15% of the heap risks OOM errors. The disk cache is limited by device storage, typically abundant but shared. The network layer has no storage constraint but is limited by bandwidth and data costs.

Cache invalidation across layers must be coordinated. When you invalidate a memory cache entry, consider whether the disk entry is still valid. If written 30 seconds ago, it is probably fresh. If written 30 minutes ago, invalidate it.

```kotlin
class CoordinatedCache<K, V>(
    private val memoryCacheTtlMs: Long = 60_000,
    private val diskCacheTtlMs: Long = 300_000,
) {
    private val memoryCache = LruCacheWithTtl<K, V>(maxSize = 100, ttlMs = memoryCacheTtlMs)

    fun invalidate(key: K, aggressive: Boolean = false) {
        memoryCache.remove(key)
        if (aggressive) markDiskStale(key)
    }
}
```

#### Design Pitfalls

The most common caching pitfall is not considering the memory overhead of cached objects. Cache only the data you need, and lazy-load related data when accessed.

Another pitfall is not evicting cache entries when the app goes to the background. Android may keep your process alive but reduce its memory allocation. Trimming the memory cache on `onTrimMemory()` prevents the OS from killing your process.

```kotlin
class LifecycleAwareCacheManager(
    private val memoryCache: LruCache<String, Any>,
) : ComponentCallbacks2 {
    override fun onTrimMemory(level: Int) {
        when {
            level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> memoryCache.evictAll()
            level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE -> memoryCache.trimToSize(memoryCache.maxSize() / 2)
            level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> memoryCache.trimToSize(memoryCache.maxSize() * 3 / 4)
        }
    }
    override fun onConfigurationChanged(c: android.content.res.Configuration) {}
    override fun onLowMemory() { memoryCache.evictAll() }
}
```

**Key takeaway:** A three-layer cache (memory → disk → network) provides instant reads for repeated access. Always populate all layers when fresh data arrives, and promote data to faster layers on cache hits to ensure subsequent reads are as fast as possible.

### Lesson 4.2: Cache Invalidation Strategies

Cache invalidation is famously one of the two hard problems in computer science (the other being naming things and off-by-one errors). The challenge is knowing when cached data is no longer valid. Serve stale data too long and users see outdated information. Invalidate too aggressively and you make unnecessary network calls, wasting bandwidth and battery. Five main strategies exist, each with different tradeoffs: time-based expiry, event-based invalidation, ETag-based validation, version-based invalidation, and stale-while-revalidate. Choosing the right strategy depends on how frequently your data changes, how critical freshness is, and how tolerant your users are of seeing slightly outdated information.

Time-based expiry (TTL) is the simplest: data is valid for N minutes after it was fetched. When the TTL expires, the next read triggers a network fetch. This works well when you know the expected change frequency. A product catalog that updates hourly can use a 30-minute TTL. A stock ticker needs a 10-second TTL. The downside is that data might change before the TTL expires (serving stale data) or remain unchanged after expiry (wasting a network call). Despite its simplicity, TTL is the right starting point for most features because it requires zero server cooperation and is easy to reason about. The following implementation shows a reusable cache policy with configurable TTL:

```kotlin
class CachePolicy(
    private val maxAgeMs: Long = 5 * 60 * 1000,
) {
    fun isExpired(lastFetchedAt: Long): Boolean {
        return System.currentTimeMillis() - lastFetchedAt > maxAgeMs
    }

    fun remainingTtlMs(lastFetchedAt: Long): Long {
        val elapsed = System.currentTimeMillis() - lastFetchedAt
        return (maxAgeMs - elapsed).coerceAtLeast(0)
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

        if (!forceRefresh && cached.isNotEmpty() && !cachePolicy.isExpired(lastFetched)) {
            return cached.map { it.toDomain() }
        }

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

Event-based invalidation is more precise: cache entries are invalidated when a specific event occurs. The user updates their profile — invalidate the profile cache entry. A push notification arrives indicating new messages — invalidate the message list cache. This approach uses server push (WebSocket, FCM) to tell the client exactly what changed, eliminating both staleness and unnecessary fetches. The downside is implementation complexity and dependency on a push channel. When the push channel is unavailable (app in background, poor connectivity), you fall back to TTL-based expiry. The following example shows how to wire FCM-based invalidation into your cache layer:

```kotlin
class CacheInvalidationHandler(
    private val userRepository: UserRepository,
    private val messageRepository: MessageRepository,
    private val feedRepository: FeedRepository,
) {
    fun onPushEvent(event: CacheInvalidationEvent) {
        when (event) {
            is CacheInvalidationEvent.UserUpdated -> {
                userRepository.invalidateUser(event.userId)
            }
            is CacheInvalidationEvent.NewMessages -> {
                messageRepository.invalidateConversation(event.conversationId)
            }
            is CacheInvalidationEvent.FeedRefresh -> {
                feedRepository.invalidateAll()
            }
        }
    }
}

sealed class CacheInvalidationEvent {
    data class UserUpdated(val userId: String) : CacheInvalidationEvent()
    data class NewMessages(val conversationId: String) : CacheInvalidationEvent()
    data object FeedRefresh : CacheInvalidationEvent()
}
```

ETag-based validation is a hybrid approach: the client sends a conditional request with the cached response's ETag header. The server returns 304 Not Modified if the data hasn't changed (saving bandwidth) or 200 with new data if it has. This eliminates unnecessary data transfer but still requires a network roundtrip to check freshness. OkHttp handles ETags automatically if your server sends the right headers, and it works transparently with OkHttp's built-in disk cache. For application-level caching with Room, you can store the ETag alongside the cached data and send it manually in your API calls.

The stale-while-revalidate pattern combines the best of both worlds: return cached data immediately for a responsive UI, then fetch fresh data in the background and update the cache. The user sees instant results, and the UI automatically updates when the fresh data arrives via Flow or LiveData. This pattern is ideal for screens where showing slightly stale data is acceptable as long as it eventually refreshes. The key is emitting the cached value first and the network value second through a reactive stream:

```kotlin
class StaleWhileRevalidateRepository(
    private val api: ArticleApi,
    private val dao: ArticleDao,
    private val cachePolicy: CachePolicy,
) {
    fun getArticles(): Flow<List<Article>> = flow {
        // Emit cached data immediately
        val cached = dao.getAll().map { it.toDomain() }
        if (cached.isNotEmpty()) {
            emit(cached)
        }

        // Revalidate from network in background
        try {
            val fresh = api.getArticles()
            dao.replaceAll(fresh.map { it.toEntity() })
            dao.updateFetchTimestamp(System.currentTimeMillis())
            emit(fresh)
        } catch (e: IOException) {
            if (cached.isEmpty()) throw e
            // Stale data already emitted; silently skip network error
        }
    }
}
```

Version-based invalidation uses a server-provided version number or hash to determine freshness. The client stores the current version alongside the cached data. On each request, the client sends its cached version to the server, which responds with either "current" (no data transfer needed) or the new data plus a new version number. This is similar to ETags but uses application-level semantics rather than HTTP headers, giving you more control over what constitutes a meaningful change. It works especially well for configuration data or feature flags where changes are infrequent but critical. The following example demonstrates version-based invalidation for app configuration:

```kotlin
class VersionedConfigRepository(
    private val api: ConfigApi,
    private val dao: ConfigDao,
) {
    suspend fun getConfig(): AppConfig {
        val cached = dao.getConfig()
        val currentVersion = cached?.version ?: 0

        return try {
            val response = api.getConfig(sinceVersion = currentVersion)
            if (response.code() == 304) {
                cached?.toDomain() ?: throw IllegalStateException("No cached config")
            } else {
                val fresh = response.body()!!
                dao.upsert(fresh.toEntity())
                fresh
            }
        } catch (e: IOException) {
            cached?.toDomain() ?: throw e
        }
    }
}
```

Generating consistent cache keys is a foundational concern that cuts across all invalidation strategies. A poorly constructed cache key causes phantom misses (same data stored under different keys) or collisions (different data stored under the same key). For API-backed caches, build your cache key from the endpoint path and all query parameters in a deterministic order. The following utility ensures consistent key generation regardless of parameter ordering:

```kotlin
object CacheKeyGenerator {
    fun fromEndpoint(path: String, params: Map<String, String> = emptyMap()): String {
        val sortedParams = params.entries
            .sortedBy { it.key }
            .joinToString("&") { "${it.key}=${it.value}" }

        val raw = if (sortedParams.isEmpty()) path else "$path?$sortedParams"
        return MessageDigest.getInstance("SHA-256")
            .digest(raw.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }

    fun forUser(userId: String, section: String = "profile"): String {
        return fromEndpoint("/users/$userId/$section")
    }
}
```

#### Common Mistakes

The most common mistake is using a single TTL for all data types in your app. User profile data that changes once a month does not need the same 30-second TTL as a live sports score. Define separate cache policies per data category — long TTLs for stable reference data, short TTLs for volatile real-time data, and event-based invalidation for user-initiated changes.

Another frequent error is invalidating only the memory cache and forgetting the disk cache. When a user updates their profile, you must clear the entry from both layers. Otherwise the next app launch loads the stale profile from Room and the user thinks their update was lost. Always pair `memoryCache.remove(key)` with a corresponding `dao.delete(key)` or a flag that marks the disk entry as dirty.

Developers also frequently implement pull-to-refresh by simply calling the network and replacing the cache, without showing any indication that the data was stale before the refresh. Users should see a visual cue (a subtle timestamp, a "last updated" label) so they know whether they are looking at fresh or cached data. Transparency about data freshness builds user trust and reduces confusion.

Beyond the three main strategies (TTL, event-based, ETag), two additional strategies deserve mention: version-based invalidation and scope-based invalidation.

Version-based invalidation attaches a version number to each cached entity. The server increments the version when the entity changes. The client checks its cached version against the server's current version.

Scope-based invalidation invalidates entire categories of cache entries when a relevant event occurs. When the user changes their language, all translated content cache entries are invalidated. When the user logs out, all user-specific cache entries are invalidated.

```kotlin
class ScopedCache<V> {
    data class ScopedEntry<V>(val value: V, val scopes: Set<String>)
    private val entries = mutableMapOf<String, ScopedEntry<V>>()

    fun put(key: String, value: V, scopes: Set<String>) {
        entries[key] = ScopedEntry(value, scopes)
    }

    fun get(key: String): V? = entries[key]?.value

    fun invalidateScope(scope: String) {
        entries.entries.removeAll { scope in it.value.scopes }
    }
}

// Usage
val cache = ScopedCache<String>()
cache.put("home_feed", feedJson, scopes = setOf("user_123", "language_en"))
cache.put("profile", profileJson, scopes = setOf("user_123"))
// User changes language:
cache.invalidateScope("language_en") // home_feed invalidated, profile remains
```

Stale-while-revalidate is a hybrid approach where the cache serves stale data immediately while fetching fresh data in the background. The user sees instant results and the data silently updates when the fresh version arrives.

```kotlin
fun <T> staleWhileRevalidate(
    cacheKey: String,
    cache: SimpleCache<T>,
    fetch: suspend () -> T,
): Flow<CachedValue<T>> = flow {
    val cached = cache.get(cacheKey)
    if (cached != null) {
        emit(CachedValue(data = cached, isStale = cache.isExpired(cacheKey)))
    }
    try {
        val fresh = fetch()
        cache.put(cacheKey, fresh)
        emit(CachedValue(data = fresh, isStale = false))
    } catch (e: Exception) {
        if (cached == null) throw e
    }
}

data class CachedValue<T>(val data: T, val isStale: Boolean)
```

**Key takeaway:** Cache invalidation is a spectrum from simple (time-based TTL) to precise (event-based). Choose the simplest strategy that meets your freshness requirements. Offer pull-to-refresh for user-triggered invalidation. Never show stale data without indicating it might be outdated.

### Lesson 4.3: OkHttp Network Cache

OkHttp includes a built-in HTTP cache that works with standard `Cache-Control` headers. When the server sends `Cache-Control: max-age=3600`, OkHttp stores the response on disk and serves it from cache for the next hour without making a network request. This works transparently — your Retrofit service doesn't need to know about caching at all. The cache respects standard HTTP semantics: `max-age`, `no-cache`, `no-store`, `must-revalidate`, and `ETag`/`If-None-Match` for conditional requests. For mobile apps, this cache layer is essentially free performance — you configure it once and every compliant GET request benefits automatically without any changes to your repository or ViewModel code.

This cache layer sits below your application logic and above the wire. It is ideal for resources that rarely change and have proper cache headers — static configuration, images, feature flags, terms of service. It is not a replacement for your Room-based application cache because it doesn't support reactive queries, offline reads without a prior cache hit, or cross-entity relationships. Think of it as a bandwidth optimization layer, not an offline-first strategy. The OkHttp cache stores raw HTTP responses as files on disk, so it cannot merge partial updates, handle relational data, or notify your UI when cached data changes. Your Room database handles all of those responsibilities.

Configuring the OkHttp cache requires specifying a directory and maximum size. A good default is 10-50MB depending on your app's data profile. The cache uses LRU eviction — when it exceeds the maximum size, the least recently accessed entries are removed. You should always place the cache directory inside `context.cacheDir` so the system can reclaim the space when the device runs low on storage. The following snippet shows the standard setup with a 50MB cache:

```kotlin
fun createCachedOkHttpClient(context: Context): OkHttpClient {
    val cacheDir = File(context.cacheDir, "http_cache")
    val cacheSize = 50L * 1024 * 1024 // 50 MB

    return OkHttpClient.Builder()
        .cache(Cache(cacheDir, cacheSize))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
}
```

When the device is offline, OkHttp's default behavior is to fail the request even if a cached response exists (because the cached response might be stale beyond its `max-age`). To provide basic offline support, you can add an application interceptor that forces the cache to serve stale responses when no network is available. This interceptor modifies the request's `Cache-Control` header to accept responses that are up to 7 days old. The distinction between application interceptors and network interceptors matters here — application interceptors run before the cache is checked, so they can influence cache behavior; network interceptors run after and only see requests that actually hit the network:

```kotlin
class OfflineCacheInterceptor(
    private val connectivityMonitor: ConnectivityMonitor,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        var request = chain.request()
        if (!connectivityMonitor.isCurrentlyConnected()) {
            request = request.newBuilder()
                .cacheControl(
                    CacheControl.Builder()
                        .maxStale(7, TimeUnit.DAYS)
                        .build()
                )
                .build()
        }
        return chain.proceed(request)
    }
}

fun createOfflineCapableClient(
    context: Context,
    connectivityMonitor: ConnectivityMonitor,
): OkHttpClient {
    val cacheDir = File(context.cacheDir, "http_cache")
    val cacheSize = 50L * 1024 * 1024

    return OkHttpClient.Builder()
        .cache(Cache(cacheDir, cacheSize))
        .addInterceptor(OfflineCacheInterceptor(connectivityMonitor))
        .build()
}
```

Sometimes the server does not send proper cache headers, but you still want to cache certain responses. A network interceptor can inject `Cache-Control` headers into responses that lack them, forcing OkHttp to cache those responses for a specified duration. This is useful when you consume a third-party API that you cannot modify. Be careful with this approach — you are overriding the server's intended caching policy, which could lead to serving stale data for endpoints that the server intentionally marked as uncacheable:

```kotlin
class ForceCacheNetworkInterceptor(
    private val maxAgeSeconds: Int = 300,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())

        // Only inject cache headers if the server didn't provide them
        if (response.header("Cache-Control") == null) {
            return response.newBuilder()
                .removeHeader("Pragma")
                .header("Cache-Control", "public, max-age=$maxAgeSeconds")
                .build()
        }
        return response
    }
}
```

For debugging cache behavior during development, OkHttp exposes cache statistics through `cache.hitCount()`, `cache.networkCount()`, and `cache.requestCount()`. Logging these values helps you verify that your cache is actually being used and diagnose why certain requests bypass it. You can also inspect the response's `cacheResponse` and `networkResponse` properties to determine whether a specific response came from cache or network. The following logging interceptor captures this information for every request:

```kotlin
class CacheDebugInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)

        val cacheResponse = response.cacheResponse
        val networkResponse = response.networkResponse

        val source = when {
            cacheResponse != null && networkResponse == null -> "CACHE"
            cacheResponse == null && networkResponse != null -> "NETWORK"
            cacheResponse != null && networkResponse != null -> "CONDITIONAL"
            else -> "UNKNOWN"
        }

        Log.d("CacheDebug", "[${response.code}] $source ${request.url}")
        return response
    }
}
```

OkHttp's cache works exclusively with GET requests. POST, PUT, DELETE, and PATCH requests are never cached because they have side effects. If you need to cache the result of a POST request (some APIs use POST for complex queries), you must implement application-level caching with Room or your own key-value store. Additionally, the OkHttp cache is a single-process resource — if your app uses multiple processes, each process needs its own cache directory or you risk file corruption. The following example shows how to selectively bypass the cache for specific endpoints using a custom request header that your interceptor strips before sending:

```kotlin
class SelectiveCacheInterceptor(
    private val noCachePaths: Set<String>,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val path = request.url.encodedPath

        if (path in noCachePaths) {
            val noCacheRequest = request.newBuilder()
                .cacheControl(CacheControl.FORCE_NETWORK)
                .build()
            return chain.proceed(noCacheRequest)
        }

        return chain.proceed(request)
    }
}
```

#### Common Mistakes

The most common mistake is placing the cache directory in external storage or a non-cache directory. Files in `context.cacheDir` are automatically cleaned up by the system when storage is low, but files in other directories persist indefinitely and can waste user storage. Always use `context.cacheDir` as the parent for your OkHttp cache directory.

Another frequent error is adding the offline interceptor as a network interceptor instead of an application interceptor. Network interceptors only run when a network request is actually made, which means your offline fallback logic never executes when there is no network. The `addInterceptor()` method adds an application interceptor; `addNetworkInterceptor()` adds a network interceptor. For offline caching, you must use `addInterceptor()`.

Developers also sometimes create multiple `OkHttpClient` instances with different cache directories, leading to duplicated cached data and wasted disk space. Share a single `OkHttpClient` instance (via dependency injection) across your entire app. If you need different timeout configurations for different API calls, use `client.newBuilder()` to create a derived client that shares the same connection pool and cache.

Configuring the OkHttp cache effectively requires understanding HTTP cache semantics. The `max-age` directive tells OkHttp how long the response is fresh. The `must-revalidate` directive tells OkHttp to check with the server using an ETag. The `no-store` directive prevents any caching — use this for sensitive data.

For mobile apps, the optimal cache configuration depends on data type. Static configuration should have long max-age values. Image URLs should leverage the OkHttp cache with long max-age. API responses for dynamic data should have short max-age or no-cache because Room handles caching for these.

A common pattern is a per-endpoint cache policy interceptor that applies different caching policies per endpoint.

```kotlin
class CachePolicyInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val response = chain.proceed(request)

        val cacheControl = when {
            request.url.encodedPath.contains("/config") ->
                CacheControl.Builder().maxAge(1, TimeUnit.HOURS).build()
            request.url.encodedPath.contains("/products/") ->
                CacheControl.Builder().maxAge(10, TimeUnit.MINUTES).build()
            request.url.encodedPath.contains("/checkout") ->
                CacheControl.Builder().noStore().build()
            else ->
                CacheControl.Builder().maxAge(5, TimeUnit.MINUTES).build()
        }

        return response.newBuilder()
            .removeHeader("Cache-Control")
            .addHeader("Cache-Control", cacheControl.toString())
            .build()
    }
}
```

#### Design Pitfalls

A common pitfall is setting the OkHttp cache size too small. A 10MB cache fills up quickly. Start with 50MB and monitor cache hit rates to tune.

Another pitfall is forgetting that POST requests are never cached by OkHttp (per HTTP specification). If you need to cache mutation results, do it at the application level with Room.

**Key takeaway:** OkHttp's built-in cache is a free bandwidth optimization that works with standard HTTP cache headers. Use it for static resources alongside your Room cache, not as a replacement. Add an offline cache interceptor to serve stale responses when the network is unavailable.

### Lesson 4.4: LRU Cache with TTL

The standard Android `LruCache` evicts entries when the cache exceeds a maximum size, but it doesn't support time-based expiry. In practice, you often need both: evict the least recently used entry when the cache is full, and expire entries after a configurable TTL even if the cache has room. Combining LRU with TTL prevents the cache from serving data that was written hours ago but happens to be accessed frequently enough to avoid LRU eviction. This dual eviction strategy is the foundation of a production-quality in-memory cache for mobile apps.

The implementation wraps each cache value in a `CacheEntry` that records the insertion timestamp. On every `get`, the entry's age is checked against the TTL. If expired, the entry is removed and `null` is returned, triggering a cache miss that cascades to the disk or network layer. The `evictExpired` method can be called periodically (e.g., on a timer or lifecycle event) to proactively clean up stale entries rather than waiting for a get to discover them. This proactive eviction keeps memory usage predictable and prevents a burst of expired entries from all being discovered and refetched simultaneously.

Thread safety is essential because the cache might be accessed from multiple coroutines simultaneously. The simple approach is `@Synchronized` on every method. For higher concurrency, use `ConcurrentHashMap` with atomic operations, but be aware that compound operations (check-then-act) still need external synchronization. For most mobile apps, the `@Synchronized` approach is fast enough — contention is rare because UI-driven access patterns are naturally sequential. The core implementation uses a `LinkedHashMap` in access-order mode, which naturally provides LRU semantics by moving accessed entries to the tail:

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

In production, you often want to track cache performance metrics — hit rate, miss rate, and eviction count — to know whether your cache size and TTL are tuned correctly. A low hit rate means either the cache is too small (entries are evicted before reuse) or the TTL is too short (entries expire before reuse). The following enhanced version adds hit/miss counters that you can report to your analytics backend:

```kotlin
class InstrumentedLruCache<K, V>(
    private val maxSize: Int,
    private val ttlMs: Long,
    private val cacheName: String,
) {
    private val delegate = LruCacheWithTtl<K, V>(maxSize, ttlMs)

    private var hitCount = 0L
    private var missCount = 0L
    private var evictionCount = 0L

    @Synchronized
    fun get(key: K): V? {
        val value = delegate.get(key)
        if (value != null) hitCount++ else missCount++
        return value
    }

    @Synchronized
    fun put(key: K, value: V) {
        delegate.put(key, value)
    }

    fun hitRate(): Double {
        val total = hitCount + missCount
        return if (total == 0L) 0.0 else hitCount.toDouble() / total
    }

    fun stats(): CacheStats = CacheStats(
        name = cacheName,
        hitCount = hitCount,
        missCount = missCount,
        hitRate = hitRate(),
        size = delegate.size(),
        maxSize = maxSize,
    )
}

data class CacheStats(
    val name: String,
    val hitCount: Long,
    val missCount: Long,
    val hitRate: Double,
    val size: Int,
    val maxSize: Int,
)
```

A common need is an atomic `getOrPut` operation that checks the cache and populates it in a single synchronized block, avoiding the race condition where two coroutines both miss the cache and both fetch from the network. This compound operation must be synchronized even when using `ConcurrentHashMap` because the check-then-act sequence is not atomic. The following extension function adds this capability to the LRU cache:

```kotlin
@Synchronized
fun <K, V> LruCacheWithTtl<K, V>.getOrPut(
    key: K,
    defaultValue: () -> V,
): V {
    get(key)?.let { return it }
    val value = defaultValue()
    put(key, value)
    return value
}

suspend fun <K, V> LruCacheWithTtl<K, V>.getOrFetch(
    key: K,
    fetch: suspend () -> V,
): V {
    get(key)?.let { return it }
    val value = fetch()
    put(key, value)
    return value
}
```

Different data types deserve different TTL values. User profile data that rarely changes can have a 30-minute TTL. A live feed that updates every few seconds needs a 15-second TTL. Configuration data fetched at launch might have a TTL that spans the entire session. Rather than hardcoding these values, define a sealed class or enum that maps data categories to cache configurations. This makes it easy to adjust caching behavior per feature without touching the cache implementation:

```kotlin
sealed class CacheTier(val maxSize: Int, val ttlMs: Long) {
    data object HotData : CacheTier(maxSize = 50, ttlMs = 15_000L)
    data object WarmData : CacheTier(maxSize = 200, ttlMs = 5 * 60_000L)
    data object ColdData : CacheTier(maxSize = 500, ttlMs = 30 * 60_000L)
    data object SessionData : CacheTier(maxSize = 100, ttlMs = Long.MAX_VALUE)
}

class CacheRegistry {
    private val caches = mutableMapOf<String, LruCacheWithTtl<String, Any>>()

    fun <V : Any> getOrCreate(name: String, tier: CacheTier): LruCacheWithTtl<String, V> {
        @Suppress("UNCHECKED_CAST")
        return caches.getOrPut(name) {
            LruCacheWithTtl(tier.maxSize, tier.ttlMs)
        } as LruCacheWithTtl<String, V>
    }

    fun evictAllExpired() {
        caches.values.forEach { it.evictExpired() }
    }

    fun clearAll() {
        caches.values.forEach { it.clear() }
    }
}
```

Proactive eviction of expired entries prevents memory from being held by stale data that will never be served. You can trigger eviction on lifecycle events — for example, run `evictExpired()` in `onTrimMemory()` when the system signals memory pressure, or on a periodic timer every 60 seconds. Tying eviction to `Application.onTrimMemory()` is especially important because it lets you shed cached data before the system kills your process. The following lifecycle-aware component handles both periodic and system-triggered eviction:

```kotlin
class CacheEvictionManager(
    private val cacheRegistry: CacheRegistry,
    private val scope: CoroutineScope,
) : DefaultLifecycleObserver {

    private var evictionJob: Job? = null

    override fun onStart(owner: LifecycleOwner) {
        evictionJob = scope.launch {
            while (isActive) {
                delay(60_000L)
                cacheRegistry.evictAllExpired()
            }
        }
    }

    override fun onStop(owner: LifecycleOwner) {
        evictionJob?.cancel()
    }

    fun onTrimMemory(level: Int) {
        when {
            level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE -> {
                cacheRegistry.clearAll()
            }
            level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> {
                cacheRegistry.evictAllExpired()
            }
        }
    }
}
```

#### Common Mistakes

The most frequent mistake is using `System.currentTimeMillis()` for TTL calculations without considering that the user can change the device clock. If a user sets their clock forward by an hour, all cache entries instantly appear expired. For TTL durations under a few minutes this rarely matters, but for longer TTLs consider using `SystemClock.elapsedRealtime()` instead, which is monotonic and unaffected by clock changes.

Another common error is setting the LRU max size too high in an attempt to avoid evictions. An LRU cache with 10,000 entries holding complex domain objects can consume tens of megabytes of heap, leading to increased GC pauses and potential `OutOfMemoryError` on low-end devices. Always estimate the per-entry memory cost and multiply by your max size to verify the total fits comfortably within your app's memory budget.

Developers also sometimes forget that `LinkedHashMap` with access-order mode reorders entries on every `get()` call, which means iteration during `evictExpired()` can produce surprising results if `get()` is called concurrently. The `@Synchronized` approach handles this correctly, but if you switch to a lock-free design, you must account for the fact that reads mutate the internal structure of an access-ordered `LinkedHashMap`.

**Key takeaway:** Combine LRU eviction with time-based TTL for a cache that limits both size and staleness. Thread-safe access is essential for coroutine-based apps, and simple `@Synchronized` is sufficient for most mobile cache access patterns.

### Lesson 4.5: Cache Warming and Prefetching

Cache warming is the practice of proactively populating the cache before the user needs the data. Instead of waiting for the user to navigate to a screen and then fetching data (resulting in a loading spinner), you predict what data they'll need and fetch it in advance. This shifts the latency from user-visible to invisible, making the app feel instant. The difference between a good app and a great app is often whether the data is already there when the user arrives at a screen. Cache warming is the primary technique for achieving that perceived immediacy.

Common cache warming strategies include: warming on app launch (prefetch the home screen data, user profile, and feature flags), warming on navigation intent (when the user starts scrolling toward a section, prefetch the next page), and warming on push notification (when a notification arrives, prefetch the content it links to so the screen loads instantly when tapped). The key constraint is battery — prefetching too aggressively wastes battery and bandwidth. Only prefetch data the user is likely to need in the next few minutes. A good heuristic is to prefetch data with greater than 70% probability of being viewed, and skip everything else.

The simplest form of cache warming happens at app launch. You know with near certainty that the user will see the home screen, so prefetching that data during the splash screen or initialization phase is always worthwhile. Use `supervisorScope` so that a failure in one prefetch does not cancel the others — the user profile fetch should not prevent the settings fetch from completing. The following implementation shows a launch warmer that respects network type:

```kotlin
class CacheWarmer(
    private val userRepository: UserRepository,
    private val feedRepository: FeedRepository,
    private val settingsRepository: SettingsRepository,
    private val connectivityMonitor: ConnectivityMonitor,
    private val scope: CoroutineScope,
) {
    fun warmOnLaunch() {
        scope.launch {
            supervisorScope {
                // Always prefetch critical data
                launch { userRepository.refreshCurrentUser() }
                launch { settingsRepository.refreshSettings() }
                // Only prefetch feed on unmetered connections
                if (!connectivityMonitor.state.value.isMetered) {
                    launch { feedRepository.refreshFirstPage() }
                }
            }
        }
    }
}
```

Navigation-based prefetching warms the cache when you can predict the user's next destination. When the user taps on a conversation in a list, you can start prefetching the message history before the navigation animation completes. When the user hovers over a tab or begins a swipe gesture, you can prefetch that tab's data. The prediction does not need to be perfect — even a 70% accuracy rate means 7 out of 10 screen transitions feel instant. The following example shows how to trigger prefetching based on predicted navigation destinations:

```kotlin
class NavigationPrefetcher(
    private val userRepository: UserRepository,
    private val chatRepository: ChatRepository,
    private val productRepository: ProductRepository,
    private val scope: CoroutineScope,
) {
    private val activePrefetches = ConcurrentHashMap<String, Job>()

    fun prefetchForDestination(destination: NavigationDestination) {
        val key = destination.prefetchKey()
        // Avoid duplicate prefetches for the same destination
        if (activePrefetches.containsKey(key)) return

        val job = scope.launch {
            try {
                when (destination) {
                    is NavigationDestination.Profile ->
                        userRepository.refreshUser(destination.userId)
                    is NavigationDestination.Chat ->
                        chatRepository.prefetchMessages(destination.chatId, limit = 30)
                    is NavigationDestination.ProductDetail ->
                        productRepository.refreshProduct(destination.productId)
                    else -> {}
                }
            } finally {
                activePrefetches.remove(key)
            }
        }
        activePrefetches[key] = job
    }

    fun cancelPrefetch(destination: NavigationDestination) {
        activePrefetches.remove(destination.prefetchKey())?.cancel()
    }
}
```

For list-based UIs, Paging 3's `prefetchDistance` parameter handles prefetching automatically — it loads the next page when the user is within N items of the end. For non-paginated data, WorkManager with network constraints handles background prefetching during idle periods. The `isMetered` flag from the connectivity monitor lets you make smart decisions: on WiFi, prefetch aggressively; on cellular, prefetch only critical data. The following WorkManager-based prefetcher runs periodically to keep frequently accessed data warm:

```kotlin
class CacheWarmingWorker(
    appContext: Context,
    params: WorkerParameters,
    private val feedRepository: FeedRepository,
    private val userRepository: UserRepository,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        return try {
            supervisorScope {
                launch { feedRepository.refreshFirstPage() }
                launch { userRepository.refreshCurrentUser() }
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        fun enqueue(workManager: WorkManager) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.UNMETERED)
                .setRequiresBatteryNotLow(true)
                .build()

            val request = PeriodicWorkRequestBuilder<CacheWarmingWorker>(
                repeatInterval = 1, repeatIntervalTimeUnit = TimeUnit.HOURS,
            )
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build()

            workManager.enqueueUniquePeriodicWork(
                "cache_warming",
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
}
```

Push notification-triggered prefetching is the most targeted form of cache warming. When a notification arrives, you know exactly what content the user will see if they tap it. Prefetching that content in the `FirebaseMessagingService.onMessageReceived()` callback means the destination screen loads instantly from cache when the user taps the notification. This works especially well for chat apps (prefetch the new message thread), news apps (prefetch the article), and social apps (prefetch the post that was liked or commented on). Keep the prefetch work lightweight — fetch only the primary content, not all related data:

```kotlin
class NotificationPrefetchService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val prefetchScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        when (data["type"]) {
            "new_message" -> {
                val chatId = data["chat_id"] ?: return
                prefetchScope.launch {
                    try {
                        chatRepository.prefetchMessages(chatId, limit = 20)
                    } catch (_: Exception) { }
                }
            }
            "new_article" -> {
                val articleId = data["article_id"] ?: return
                prefetchScope.launch {
                    try {
                        articleRepository.prefetchArticle(articleId)
                    } catch (_: Exception) { }
                }
            }
        }

        showNotification(data)
    }
}
```

Measuring the effectiveness of your prefetching strategy is critical to justifying the bandwidth and battery cost. Track two metrics: the prefetch hit rate (how often prefetched data is actually used before it expires) and the time-to-content reduction (how much faster screens load with warm caches versus cold caches). A prefetch hit rate below 50% means you are wasting more bandwidth than you are saving in latency. In that case, narrow your prefetch scope to only the highest-probability destinations. Log these metrics alongside your cache hit rate to build a complete picture of your caching layer's effectiveness. The following tracker records prefetch events and calculates the hit rate:

```kotlin
class PrefetchTracker {
    private val prefetchedKeys = ConcurrentHashMap<String, Long>()
    private var totalPrefetches = 0L
    private var usedPrefetches = 0L

    fun onPrefetch(key: String) {
        prefetchedKeys[key] = System.currentTimeMillis()
        totalPrefetches++
    }

    fun onAccess(key: String) {
        if (prefetchedKeys.remove(key) != null) {
            usedPrefetches++
        }
    }

    fun hitRate(): Double {
        return if (totalPrefetches == 0L) 0.0
        else usedPrefetches.toDouble() / totalPrefetches
    }

    fun evictStale(maxAgeMs: Long = 5 * 60_000L) {
        val now = System.currentTimeMillis()
        prefetchedKeys.entries.removeAll { now - it.value > maxAgeMs }
    }
}
```

#### Common Mistakes

The most common mistake is prefetching too aggressively on cellular connections. Users on metered data plans do not appreciate background data consumption for screens they may never visit. Always check `connectivityMonitor.state.value.isMetered` before prefetching non-essential data, and provide a user setting to disable background prefetching entirely. Respecting the user's data budget builds trust and prevents negative app store reviews.

Another frequent error is not cancelling prefetch jobs when the user navigates away from the predicted destination. If the user taps a conversation but then immediately presses back, the prefetch for that conversation's messages should be cancelled to avoid wasting bandwidth. Track active prefetch jobs in a map keyed by destination and cancel them when the prediction turns out to be wrong.

Developers also sometimes warm the cache by calling repository methods that emit to shared Flows or LiveData, causing unexpected UI updates during prefetching. Prefetch methods should write to the cache silently without triggering reactive emissions. Create dedicated `prefetch` methods on your repositories that write to Room and the memory cache but do not emit to any observable streams. This keeps the prefetch invisible to the UI layer until the user actually navigates to the relevant screen.

The timing of cache warming is critical. Warming too early wastes bandwidth on data the user might never need. Warming too late means loading spinners. The sweet spot is predictive warming based on signals.

Navigation intent prediction can be surprisingly accurate. If the user is browsing a product list, they are likely to tap a product detail soon. Prefetching the top 3-5 product details ensures instant loading. If the user opened a notification, prefetch the linked content immediately.

```kotlin
class PredictiveCacheWarmer(
    private val repository: ProductRepository,
    private val scope: CoroutineScope,
) {
    fun warmVisibleProducts(visibleProductIds: List<String>) {
        scope.launch {
            supervisorScope {
                visibleProductIds.take(5).forEach { id ->
                    launch { repository.prefetchProduct(id) }
                }
            }
        }
    }

    fun warmNotificationContent(data: Map<String, String>) {
        scope.launch {
            when (data["type"]) {
                "message" -> repository.prefetchChat(data["chatId"] ?: return@launch)
                "order_update" -> repository.prefetchOrder(data["orderId"] ?: return@launch)
            }
        }
    }
}
```

Battery-aware prefetching is essential. On WiFi, prefetch aggressively. On cellular, prefetch only data the user is very likely to need. When battery is below 15%, disable all prefetching.

```kotlin
class PrefetchPolicy(
    private val connectivityMonitor: ConnectivityMonitor,
    private val batteryMonitor: BatteryMonitor,
) {
    fun shouldPrefetch(priority: PrefetchPriority): Boolean {
        if (batteryMonitor.level < 15) return false
        return when (priority) {
            PrefetchPriority.CRITICAL -> true
            PrefetchPriority.HIGH -> connectivityMonitor.state.value.isConnected
            PrefetchPriority.LOW -> !connectivityMonitor.state.value.isMetered
        }
    }
}

enum class PrefetchPriority { CRITICAL, HIGH, LOW }
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

Before diving into Paging 3 implementation, you need to understand the two fundamental pagination approaches and why cursor-based pagination is almost always the right choice for mobile apps. Offset-based pagination uses page numbers — "give me page 3 with 20 items per page" translates to `LIMIT 20 OFFSET 40`. This is simple to implement but breaks when the underlying data changes. If a new item is inserted while the user is on page 2, every subsequent page shifts by one, causing either a duplicate or a skipped item. The database also has to scan and skip all preceding rows for large offsets, making performance degrade linearly as the user scrolls deeper into the dataset.

Cursor-based pagination uses a pointer to a specific item — "give me 20 items after item X." This is stable regardless of insertions or deletions between requests. If a new post is added to a feed while the user is scrolling, cursor-based pagination doesn't shift. The cursor (usually the ID or timestamp of the last item on the current page) anchors the query to a fixed point in the dataset. The client sends this cursor with each request, and the server returns the next batch starting from that anchor. Under the hood, the server translates the cursor into a `WHERE` clause like `WHERE created_at < :cursor ORDER BY created_at DESC LIMIT 20`, which the database can satisfy using an index seek rather than a full scan. This makes cursor pagination consistently fast regardless of how deep the user has scrolled.

The tradeoff is that cursor-based pagination doesn't support "jump to page N" because you need all prior cursors to calculate page N. For most mobile UIs (infinite scroll feeds, message histories, product listings), this isn't a limitation because users scroll sequentially. For admin dashboards where users might want to jump to page 47, offset-based pagination makes more sense. In interviews, always mention cursor-based pagination for feeds and explain why it's more stable than offset-based. A third variant — keyset pagination — is technically what cursor-based pagination implements under the hood. The "cursor" is an opaque encoding of the sort key values for the last returned row, and the server decodes it to construct the `WHERE` clause. Making the cursor opaque prevents clients from tampering with it and lets the server change the underlying sort columns without breaking the contract.

The server response for cursor-based pagination should include the items, a `nextCursor` field (null if no more pages), and optionally a `hasMore` boolean for clarity. The client stores the last cursor and sends it with the next page request. This contract is simple, stable, and works across REST, GraphQL, and gRPC. On the Android side, you model this response as a data class that your Retrofit or Ktor client can deserialize directly.

```kotlin
data class PaginatedResponse<T>(
    val items: List<T>,
    val nextCursor: String?,
    val hasMore: Boolean,
)

interface FeedApi {
    @GET("feed")
    suspend fun getFeed(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
    ): PaginatedResponse<FeedItem>
}
```

When choosing which field to use as a cursor, you need a column that is both unique and naturally ordered. Timestamps alone are risky because two items can share the same millisecond value, causing one to be skipped. The safest approach is a compound cursor that combines the sort column with a tiebreaker like the primary key. You encode both values into a single opaque string that the server decodes on the next request.

```kotlin
// Server-side cursor encoding (shown in Kotlin for illustration)
fun encodeCursor(createdAt: Long, id: String): String {
    val raw = "$createdAt:$id"
    return Base64.getEncoder().encodeToString(raw.toByteArray())
}

fun decodeCursor(cursor: String): Pair<Long, String> {
    val raw = String(Base64.getDecoder().decode(cursor))
    val parts = raw.split(":")
    return parts[0].toLong() to parts[1]
}
```

On the client side, you never need to parse or understand the cursor. You treat it as an opaque token, store it after each response, and send it back with the next request. This separation of concerns means the server can change cursor encoding, switch sort columns, or migrate to a different pagination strategy without any client-side changes. Your Android code simply passes the string through.

```kotlin
class FeedRepository(private val api: FeedApi) {

    suspend fun loadPage(cursor: String? = null): PaginatedResponse<FeedItem> {
        return api.getFeed(cursor = cursor, limit = 20)
    }
}

// Usage in a simple non-Paging scenario
suspend fun loadAllPages(repository: FeedRepository) {
    var cursor: String? = null
    val allItems = mutableListOf<FeedItem>()

    do {
        val response = repository.loadPage(cursor)
        allItems.addAll(response.items)
        cursor = response.nextCursor
    } while (response.hasMore)
}
```

Understanding the database implications helps you make better decisions during system design interviews. Offset pagination forces the database to count rows from the beginning every time, which means page 500 is dramatically slower than page 1. Cursor pagination performs a constant-time index lookup regardless of position. For a feed with millions of items, this difference is the reason your app either scrolls smoothly or stalls with a loading spinner every few pages.

#### Common Mistakes

One frequent mistake is using auto-increment integer IDs as cursors in a distributed system. If you have multiple database shards or write replicas, auto-increment IDs are not globally ordered — shard A might produce ID 1000 while shard B produces ID 1001 for an older item. Use a timestamp-based ID like ULID or Snowflake, or a compound cursor with a reliable ordering column. Another common error is exposing raw database column values as cursors instead of encoding them. This leaks your schema to clients and makes it impossible to change sort columns without a breaking API change. Always encode cursors as opaque Base64 strings. Finally, many developers forget to handle the empty-page edge case — when `nextCursor` is non-null but the next page returns zero items. Your pagination loop should check both `hasMore` and the actual item count to avoid infinite loops.

Before diving into Paging 3 implementation, let me explain the fundamental tradeoffs between offset and cursor pagination in detail.

Offset-based pagination uses LIMIT and OFFSET. It is simple but has three critical problems. First, it is unstable — insertions shift all items, causing duplicates or skipped posts. Second, it is slow at large offsets — OFFSET 10000 forces the database to scan 10,000 rows. Third, it is inconsistent with concurrent modifications.

Cursor-based pagination anchors to a specific item using WHERE id > X LIMIT 20. The query is efficient regardless of position because the database uses an index. Insertions and deletions do not shift results.

```kotlin
// Offset-based — simple but fragile
suspend fun getProductsOffset(page: Int, pageSize: Int): List<Product> {
    return api.getProducts(limit = pageSize, offset = page * pageSize)
}

// Cursor-based — stable and efficient
suspend fun getProductsCursor(cursor: String?, pageSize: Int): CursorPage<Product> {
    val response = api.getProducts(after = cursor, limit = pageSize)
    return CursorPage(
        items = response.items,
        nextCursor = response.nextCursor,
        hasMore = response.nextCursor != null,
    )
}

data class CursorPage<T>(val items: List<T>, val nextCursor: String?, val hasMore: Boolean)
```

The choice of cursor field matters. Using a primary key is simplest. For timestamp-based sorting, use a composite cursor of (timestamp, id) to handle items with identical timestamps. Without the tie-breaking ID, items with the same timestamp could be skipped or duplicated.

```kotlin
@Serializable
data class TimestampCursor(val timestamp: Long, val id: String) {
    fun encode(): String = "$timestamp:$id"
    companion object {
        fun decode(encoded: String): TimestampCursor {
            val parts = encoded.split(":")
            return TimestampCursor(parts[0].toLong(), parts[1])
        }
    }
}
```

#### Design Pitfalls

The main pitfall with cursor-based pagination is not handling cursor invalidation. If the cursor item is deleted, the query might return unexpected results. The server should handle this gracefully.

Another pitfall is encoding sensitive data in cursors. Do not use raw database IDs that could leak information. Base64-encode the cursor or use opaque tokens.

**Key takeaway:** Cursor-based pagination provides stable results even when the dataset changes between requests. Use it for feeds, message lists, and any sequentially scrolled content. Reserve offset-based pagination for random-access use cases like admin dashboards.

### Lesson 5.2: Paging 3 Architecture

Paging 3 is Android's official pagination library, and it's designed around the offline-first principle. The architecture has three layers: `PagingSource` (loads pages from a single data source), `RemoteMediator` (coordinates between the network and local database), and `Pager` (ties everything together and produces `PagingData` for the UI). The most powerful configuration uses all three: the PagingSource reads from Room, the RemoteMediator fetches from the network and writes to Room, and Room's invalidation triggers the PagingSource to re-emit. This separation means your UI never talks directly to the network — it always reads from the local database, which the RemoteMediator keeps populated.

The `PagingConfig` object controls the pagination behavior. `pageSize` determines how many items per page. `prefetchDistance` controls how far from the end of the loaded list Paging starts loading the next page — a value of 5 means the next page starts loading when there are 5 items left to scroll through. `enablePlaceholders` controls whether nulls are used as placeholders for unloaded items, enabling the scrollbar to reflect the total list size. `maxSize` limits how many items are held in memory, evicting pages at the other end when exceeded. Getting these values right is crucial: a `pageSize` that is too small causes excessive network calls, while one that is too large wastes bandwidth and memory. A good rule of thumb is to set `pageSize` to roughly two to three times the number of items visible on screen at once.

```kotlin
// PagingConfig with tuned parameters for a typical feed
val pagingConfig = PagingConfig(
    pageSize = 20,
    prefetchDistance = 5,
    enablePlaceholders = false,
    maxSize = 200,
    initialLoadSize = 40, // load 2x on first fetch for faster initial display
)
```

The `PagingSource` is the component responsible for loading individual pages of data. When backed by Room, you get a PagingSource for free by declaring a DAO method that returns `PagingSource<Int, YourEntity>`. Room auto-generates the implementation, handles invalidation when data changes, and triggers re-emission through the Pager. When backed by a network API (without Room), you write a custom PagingSource that maps load parameters to API calls and returns `LoadResult.Page` or `LoadResult.Error`.

```kotlin
@Dao
interface ArticleDao {
    @Query("SELECT * FROM articles ORDER BY created_at DESC")
    fun pagingSource(): PagingSource<Int, ArticleEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(articles: List<ArticleEntity>)

    @Query("DELETE FROM articles")
    suspend fun clearAll()
}
```

The key insight is that PagingData is a self-contained stream of pages that the LazyColumn consumes. You don't manually manage page state, loading indicators, or retry logic — Paging 3 handles all of this through the `LoadState` API. The UI checks `loadState.refresh`, `loadState.append`, and `loadState.prepend` to show loading indicators, error states, and retry buttons at the appropriate positions. The `cachedIn(viewModelScope)` operator is essential — it caches the PagingData in the ViewModel so that configuration changes like screen rotation don't trigger a full reload. Without it, every recomposition or fragment recreation restarts pagination from page one.

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

The ViewModel sits between the repository and the UI, exposing the PagingData flow. You must call `cachedIn` at the ViewModel level — calling it inside the repository or inside a Composable will either cache at the wrong scope or cause recomposition issues. The ViewModel also handles user-driven actions like refresh, which you trigger by calling `refresh()` on the `LazyPagingItems` object in the UI layer.

```kotlin
class ArticleViewModel(
    private val repository: ArticleRepository,
) : ViewModel() {

    val articles: Flow<PagingData<Article>> = repository
        .getArticles()
        .cachedIn(viewModelScope)
}
```

Paging 3 also supports data transformations through operators on `PagingData`. You can `map` items to a different type, `filter` out items that don't match criteria, `insertSeparators` to add date headers or dividers between items, and `insertHeaderItem` or `insertFooterItem` for static content at the boundaries. These operators run lazily — they don't process the entire dataset upfront but transform items as they flow through the pipeline. The `insertSeparators` operator is particularly useful for grouping feed items by date, where you compare adjacent items and insert a header when the date changes.

#### Common Mistakes

A common mistake is not calling `cachedIn(viewModelScope)` on the PagingData flow, which causes the entire pagination to restart from scratch on every configuration change or recomposition. Another frequent error is setting `maxSize` to a value smaller than `pageSize + 2 * prefetchDistance` — Paging 3 will throw an `IllegalArgumentException` at runtime because it cannot guarantee smooth scrolling with those constraints. Developers also often try to collect the PagingData flow more than once (for example, collecting in both a Composable and a background observer), which creates two independent paging pipelines with duplicated network requests. PagingData should be collected exactly once, in the UI layer. Finally, avoid placing `pagingSourceFactory` calls that perform expensive work — the factory is called every time the PagingSource is invalidated, so it must be lightweight.

The key insight about Paging 3 architecture is that it decouples data loading from data display. The PagingSource handles loading pages. The Pager configuration controls behavior. The PagingData stream handles display. You can change your loading strategy without changing any UI code.

The PagingConfig parameters deserve careful tuning. `pageSize` should fill the screen with buffer (typically 20-30 items). `prefetchDistance` should be set based on scroll speed. `maxSize` limits total items in memory. `enablePlaceholders` is commonly misunderstood — when true, Paging 3 reports total item count and uses nulls for unloaded items.

```kotlin
val feedPagingConfig = PagingConfig(
    pageSize = 20,
    prefetchDistance = 10,
    enablePlaceholders = false,
    maxSize = 200,
    initialLoadSize = 40,
)

val searchPagingConfig = PagingConfig(
    pageSize = 15,
    prefetchDistance = 5,
    enablePlaceholders = false,
    maxSize = 100,
    initialLoadSize = 15,
)

val chatHistoryPagingConfig = PagingConfig(
    pageSize = 30,
    prefetchDistance = 15,
    enablePlaceholders = false,
    maxSize = 300,
    initialLoadSize = 60,
)
```

#### Common Mistakes

A common mistake is not using `cachedIn(viewModelScope)` on the PagingData flow. Without it, every configuration change restarts pagination from the beginning. `cachedIn` preserves loaded pages across configuration changes.

Another mistake is mapping PagingData items after `cachedIn`. The correct order is: `Pager().flow.map { it.map { entity -> entity.toDomain() } }.cachedIn(viewModelScope)`.

**Key takeaway:** Paging 3 with RemoteMediator gives you offline-capable pagination. The database is the source of truth for pages. The RemoteMediator fills the database from the network as the user scrolls, and Room's invalidation drives the PagingSource to re-emit.

### Lesson 5.3: RemoteMediator for Offline Pagination

The RemoteMediator is the bridge between your remote API and local database in a Paging 3 setup. It's called when the PagingSource runs out of locally cached data and needs more from the network. The `load` method receives a `LoadType` (REFRESH, PREPEND, or APPEND) and a `PagingState` that provides access to the currently loaded items and configuration. Your job is to fetch the right page from the network and insert it into the database. The RemoteMediator never returns data directly to the UI — it writes to the database, and Room's invalidation mechanism triggers the PagingSource to re-query and emit the updated dataset to the UI layer.

The `LoadType` enum drives the entire flow. `REFRESH` is called on initial load and pull-to-refresh — you typically clear the database and fetch page 1. `APPEND` is called when the user scrolls to the bottom and needs the next page. `PREPEND` is called when the user scrolls to the top and needs the previous page — for most top-down feeds, you immediately return `MediatorResult.Success(endOfPaginationReached = true)` because refresh already fetches the newest items. Understanding these three load types is essential because each one requires different logic for determining which page to fetch and how to handle the database state.

Remote keys are the mechanism for tracking which page to load next. Since the database is the source of truth, you can't rely on in-memory state for the current page number — it's lost on process death. Instead, store remote keys alongside the data in the database. Each item knows its next page number (or cursor). When `APPEND` is triggered, you look at the last item in the database to determine the next page. This survives process death because it's persisted with the data. A dedicated `RemoteKeys` table is often cleaner than embedding page metadata directly into the entity, especially when the same entity might appear in multiple paginated lists.

```kotlin
@Entity(tableName = "remote_keys")
data class RemoteKeyEntity(
    @PrimaryKey val articleId: String,
    val prevCursor: String?,
    val nextCursor: String?,
    val lastUpdated: Long,
)

@Dao
interface RemoteKeyDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(keys: List<RemoteKeyEntity>)

    @Query("SELECT * FROM remote_keys WHERE articleId = :articleId")
    suspend fun getKeyByArticleId(articleId: String): RemoteKeyEntity?

    @Query("DELETE FROM remote_keys")
    suspend fun clearAll()
}
```

The core RemoteMediator implementation coordinates the network fetch and database write inside a single Room transaction. Wrapping both the clear and insert operations in `database.withTransaction` is critical — without it, the PagingSource could observe an intermediate state where data has been cleared but not yet re-inserted, causing a brief flash of empty content. The transaction guarantees atomicity: the UI either sees the old data or the new data, never a partially updated state.

```kotlin
@OptIn(ExperimentalPagingApi::class)
class ArticleRemoteMediator(
    private val api: ArticleApi,
    private val dao: ArticleDao,
    private val remoteKeyDao: RemoteKeyDao,
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
        val cursor = when (loadType) {
            LoadType.REFRESH -> null
            LoadType.PREPEND -> return MediatorResult.Success(endOfPaginationReached = true)
            LoadType.APPEND -> {
                val lastItem = state.lastItemOrNull()
                    ?: return MediatorResult.Success(endOfPaginationReached = true)
                val remoteKey = remoteKeyDao.getKeyByArticleId(lastItem.id)
                remoteKey?.nextCursor
                    ?: return MediatorResult.Success(endOfPaginationReached = true)
            }
        }

        return try {
            val response = api.getArticles(cursor = cursor, limit = state.config.pageSize)

            database.withTransaction {
                if (loadType == LoadType.REFRESH) {
                    dao.clearAll()
                    remoteKeyDao.clearAll()
                    dao.updateFetchTimestamp(System.currentTimeMillis())
                }

                val keys = response.items.map { article ->
                    RemoteKeyEntity(
                        articleId = article.id,
                        prevCursor = response.prevCursor,
                        nextCursor = response.nextCursor,
                        lastUpdated = System.currentTimeMillis(),
                    )
                }
                remoteKeyDao.insertAll(keys)
                dao.insertAll(response.items.map { it.toEntity() })
            }

            MediatorResult.Success(
                endOfPaginationReached = response.nextCursor == null
            )
        } catch (e: IOException) {
            MediatorResult.Error(e)
        } catch (e: HttpException) {
            MediatorResult.Error(e)
        }
    }
}
```

The `initialize` method controls whether Paging 3 triggers a REFRESH on first load. By checking the cache age, you can skip the network call entirely when cached data is fresh enough. This prevents unnecessary network requests when the user navigates to a screen with recent data, improving both performance and battery life. You can tune the cache timeout based on the data's freshness requirements — a news feed might use 15 minutes, while a settings screen might use 24 hours. The return value `SKIP_INITIAL_REFRESH` tells Paging 3 to use whatever is already in the database and only hit the network when the user explicitly refreshes or scrolls past the cached data.

Error handling within the RemoteMediator needs careful thought. When `load` returns `MediatorResult.Error(e)`, Paging 3 surfaces that error through the `LoadState` API. The UI can then show a retry button that calls `retry()` on the `LazyPagingItems`. However, network errors during APPEND should not clear already-loaded data — the user should still see the items they have already scrolled through and get a retry option at the bottom. Only REFRESH errors might warrant a full-screen error state, and only when there is no cached data at all.

```kotlin
// Robust error handling with specific exception mapping
override suspend fun load(
    loadType: LoadType,
    state: PagingState<Int, ArticleEntity>,
): MediatorResult {
    return try {
        // ... fetch and insert logic ...
        MediatorResult.Success(endOfPaginationReached = false)
    } catch (e: IOException) {
        // Network error — user might be offline
        MediatorResult.Error(e)
    } catch (e: HttpException) {
        if (e.code() == 429) {
            // Rate limited — delay before retry
            delay(e.retryAfterMillis() ?: 5000L)
            MediatorResult.Error(e)
        } else {
            MediatorResult.Error(e)
        }
    } catch (e: SQLiteException) {
        // Database error — critical, should not normally happen
        MediatorResult.Error(e)
    }
}
```

Testing the RemoteMediator in isolation is straightforward because it has clear inputs and outputs. You provide a mock API, a real in-memory Room database, and a PagingState, then verify that the correct items end up in the database after each load type. Testing REFRESH verifies that old data is cleared and new data is inserted. Testing APPEND verifies that the correct cursor is extracted from remote keys and the new page is appended. Testing error scenarios verifies that `MediatorResult.Error` is returned without modifying the database.

```kotlin
@Test
fun refreshClearsAndInsertsNewData() = runTest {
    val mediator = ArticleRemoteMediator(
        api = FakeArticleApi(pages = testPages),
        dao = dao,
        remoteKeyDao = remoteKeyDao,
        database = database,
    )

    val pagingState = PagingState<Int, ArticleEntity>(
        pages = emptyList(),
        anchorPosition = null,
        config = PagingConfig(pageSize = 20),
        leadingPlaceholderCount = 0,
    )

    val result = mediator.load(LoadType.REFRESH, pagingState)

    assertTrue(result is MediatorResult.Success)
    assertFalse((result as MediatorResult.Success).endOfPaginationReached)
    assertEquals(20, dao.getAll().size)
}
```

#### Common Mistakes

The most common mistake is not wrapping clear-and-insert operations in a `database.withTransaction` block. Without the transaction, Room invalidates the PagingSource after the clear but before the insert, causing the UI to briefly flash an empty list before the new data appears. Another frequent error is storing page numbers in a `var` field on the RemoteMediator class instead of in the database — this works during normal usage but breaks on process death because the in-memory page counter resets to its initial value while the database still has data from page 3. Developers also sometimes return `endOfPaginationReached = false` when the server returns an empty list, causing Paging 3 to keep making network requests for pages that don't exist. Always set `endOfPaginationReached = true` when the response indicates there are no more items, whether through a null cursor, an empty items list, or a `hasMore = false` flag.

**Key takeaway:** RemoteMediator bridges network and database for offline pagination. Store remote keys (next page or cursor) alongside data in Room so pagination state survives process death. Use `initialize()` to skip unnecessary refreshes when cached data is fresh.

### Lesson 5.4: Consuming PagingData in Compose

Consuming PagingData in Jetpack Compose requires the `collectAsLazyPagingItems()` extension, which converts the `Flow<PagingData>` into a `LazyPagingItems` object that integrates directly with `LazyColumn`. This object provides `itemCount`, index-based access, `LoadState` for each direction (refresh, append, prepend), and `retry()` for error recovery. The UI code reads naturally — you iterate over items, check load states, and show appropriate UI for each state. The `LazyPagingItems` object is the single bridge between the Paging 3 data layer and Compose — you never manually collect pages or track page numbers in your Composables.

Load state handling is where Paging 3 shines. The `loadState` object tells you the current state of each loading direction. `loadState.refresh` is the initial full-screen load. `loadState.append` is the bottom-of-list next-page load. `loadState.prepend` is the top-of-list previous-page load. Each can be `Loading`, `NotLoading`, or `Error`. By checking these states, you show a full-screen loading indicator for initial load, a bottom spinner for next page, and inline retry buttons for errors — all without manually tracking any state. A production-quality implementation needs to handle all three directions and both the loading and error sub-states for each.

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

The `insertSeparators` operator on PagingData lets you inject non-data items like date headers or section dividers between pages without modifying your data source. This runs lazily as items flow through the pipeline, so it doesn't require loading the entire dataset upfront. You compare adjacent items and decide whether to insert a separator between them. For a feed grouped by date, you check whether the current item's date differs from the previous item's date and insert a header when it does. The separator items need their own model type, so you typically define a sealed interface that encompasses both data items and separators.

```kotlin
sealed interface FeedUiModel {
    data class ArticleItem(val article: Article) : FeedUiModel
    data class DateSeparator(val date: String) : FeedUiModel
}

// In the ViewModel
val articles: Flow<PagingData<FeedUiModel>> = repository
    .getArticles()
    .map { pagingData -> pagingData.map { FeedUiModel.ArticleItem(it) } }
    .map { pagingData ->
        pagingData.insertSeparators { before, after ->
            val beforeDate = before?.article?.createdAt?.toLocalDate()
            val afterDate = after?.article?.createdAt?.toLocalDate()
            if (afterDate != null && beforeDate != afterDate) {
                FeedUiModel.DateSeparator(afterDate.format(DateTimeFormatter.ofPattern("MMM dd")))
            } else {
                null
            }
        }
    }
    .cachedIn(viewModelScope)
```

When displaying the mixed item types in the LazyColumn, you use a `when` block to render the appropriate Composable for each model type. Each type should have its own content type specified via the `contentType` parameter, which tells LazyColumn's recycling system that these items have different layouts. This prevents the recycling system from trying to reuse an article card layout for a date separator, which would cause unnecessary recomposition.

```kotlin
@Composable
fun FeedScreen(viewModel: FeedViewModel = hiltViewModel()) {
    val items = viewModel.articles.collectAsLazyPagingItems()

    LazyColumn {
        items(
            count = items.itemCount,
            key = items.itemKey {
                when (it) {
                    is FeedUiModel.ArticleItem -> "article_${it.article.id}"
                    is FeedUiModel.DateSeparator -> "separator_${it.date}"
                }
            },
            contentType = items.itemContentType {
                when (it) {
                    is FeedUiModel.ArticleItem -> "article"
                    is FeedUiModel.DateSeparator -> "separator"
                }
            },
        ) { index ->
            when (val item = items[index]) {
                is FeedUiModel.ArticleItem -> ArticleCard(item.article)
                is FeedUiModel.DateSeparator -> DateHeader(item.date)
                null -> ArticlePlaceholder()
            }
        }
    }
}
```

For testing, Paging 3 provides a `TestPager` utility that lets you drive pagination in a controlled way without needing a real LazyColumn. You can also use the `AsyncPagingDataDiffer` to test the data pipeline independently of the UI. In integration tests, you can snapshot-test the entire screen by providing a fake PagingData flow and verifying that loading, error, and content states render correctly. The key is to test the data transformation pipeline separately from the UI rendering — the ViewModel test verifies that PagingData contains the right items with separators, while the Compose test verifies that each item type renders the right layout.

#### Common Mistakes

A common mistake is forgetting to handle the null case when accessing items via `articles[index]`. When `enablePlaceholders` is true, items outside the loaded window return null, and your Composable must render a placeholder instead of crashing with a NullPointerException. Another frequent error is putting business logic inside the Composable based on load states — for example, showing a toast on error directly in the composition. Side effects like toasts or navigation should use `LaunchedEffect` with a key derived from the load state, not run during recomposition. Developers also sometimes call `articles.refresh()` inside `LaunchedEffect(Unit)`, which triggers a redundant refresh on every recomposition of the screen — Paging 3 already handles the initial load automatically through the RemoteMediator's `initialize` method. Finally, avoid creating the `LazyPagingItems` object outside the Composable scope (for example, in the ViewModel) — it must be created inside a `@Composable` function because it hooks into the composition lifecycle.

**Key takeaway:** Use `collectAsLazyPagingItems()` to bridge Paging 3 with Compose. Handle all three load states (refresh, append, prepend) for a complete pagination UX. Always provide stable keys via `itemKey` for optimal recomposition performance.

### Lesson 5.5: Cursor-Based PagingSource

When your API uses cursor-based pagination and you don't need offline support (or you're building a network-only feature like search), you can use a standalone `PagingSource` without RemoteMediator. The PagingSource loads directly from the network using the cursor as the key type instead of an integer page number. This is simpler than the RemoteMediator approach but doesn't give you offline pagination because data isn't persisted to Room. For features like search, autocomplete, or explore feeds where caching stale results would be misleading, a network-only PagingSource is the right choice because you always want fresh results from the server.

The `load` method is the core of any PagingSource. It receives `LoadParams` that contain the key (your cursor), the requested `loadSize`, and whether this is a refresh, append, or prepend load. You use the cursor to call your API, then wrap the response in a `LoadResult.Page` containing the data, the previous key, and the next key. Returning `null` for `prevKey` disables backward pagination, which is typical for top-down feeds. Returning `null` for `nextKey` signals that there are no more pages, which stops Paging 3 from making further APPEND requests.

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
```

The `getRefreshKey` method determines where to restart pagination after a refresh (e.g., pull-to-refresh or invalidation). For most cursor-based implementations, returning `null` means "start from the beginning," which is appropriate for feeds where refresh should show the newest content. For positional refresh (showing the same position after configuration change), you'd return the cursor of the item closest to the last visible position. You can compute this using `state.anchorPosition` to find the item the user was looking at and extract its cursor from the surrounding pages.

```kotlin
override fun getRefreshKey(
    state: PagingState<String, SearchResult>,
): String? {
    // For positional refresh: restart from the page closest to the anchor
    return state.anchorPosition?.let { anchor ->
        val closestPage = state.closestPageToPosition(anchor)
        closestPage?.prevKey ?: closestPage?.nextKey
    }
}
```

The ViewModel ties the PagingSource to user input. For a search feature, you want to create a new Pager every time the query changes, but you also need to debounce rapid keystrokes to avoid firing a network request for every character. The `flatMapLatest` operator automatically cancels the previous Pager's flow when a new query arrives, ensuring you don't have stale search results racing with current ones. The `cachedIn(viewModelScope)` operator is mandatory — it prevents the entire pagination from restarting on configuration changes like screen rotation.

```kotlin
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

Invalidation is a concept that applies to both network-only and database-backed PagingSources. When the underlying data changes — for example, the user deletes a search result or the server sends a push notification that results have changed — you call `invalidate()` on the PagingSource to discard the current pages and reload from scratch. Paging 3 uses `getRefreshKey` to determine where to restart, then calls `load` to fetch fresh data. For a network-only PagingSource, you typically expose the current PagingSource instance from the factory so you can call `invalidate()` on it when needed.

```kotlin
class SearchRepository(private val api: SearchApi) {
    private var currentPagingSource: SearchPagingSource? = null

    fun searchPager(query: String): Flow<PagingData<SearchResult>> = Pager(
        config = PagingConfig(pageSize = 20, prefetchDistance = 5),
        pagingSourceFactory = {
            SearchPagingSource(api, query).also { currentPagingSource = it }
        }
    ).flow

    fun invalidateCurrentSearch() {
        currentPagingSource?.invalidate()
    }
}
```

When building a PagingSource that supports both forward and backward scrolling — for example, a message history where the user lands in the middle and can scroll in either direction — you provide both `prevKey` and `nextKey` in each `LoadResult.Page`. The initial load fetches items around a target message, APPEND loads older messages below, and PREPEND loads newer messages above. This bidirectional pattern is more complex because you need to track cursors in both directions, but it enables the "jump to message" UX that chat apps require.

#### Common Mistakes

A frequent mistake is reusing the same PagingSource instance across multiple queries instead of creating a new one each time. PagingSources are single-use — once invalidated or completed, they cannot be restarted. The `pagingSourceFactory` lambda must return a fresh instance every time it's called. Another common error is forgetting to use `flatMapLatest` when the query changes, which causes multiple Pager flows to run concurrently, wasting bandwidth and showing results from the wrong query. Developers also sometimes set `params.loadSize` as the page size in the API call without realizing that the first load uses `initialLoadSize` (which defaults to `3 * pageSize`), causing the first page to request 60 items when the API only supports a maximum of 20. Set `initialLoadSize` explicitly in `PagingConfig` to match `pageSize` if your API has a hard limit. Finally, avoid performing heavy transformations inside the `load` method — if you need to map or filter results, use the `map` and `filter` operators on the `PagingData` flow in the ViewModel instead, so the work happens outside the PagingSource's coroutine scope.

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

Pull-based sync is the simplest and most common sync strategy for mobile apps. The client periodically asks the server "what changed since my last sync?" using a server-side timestamp as the anchor. The server returns created, updated, and deleted records since that timestamp. The client applies these changes to the local database in a single transaction, then updates the stored sync timestamp. This approach is stateless on the server — there is no per-client sync state to maintain — and resilient to client failures. If sync fails midway, the timestamp is never updated, so the next sync retries everything automatically. Most production apps including email clients, note-taking apps, and task managers rely on this fundamental pattern because it is easy to reason about, simple to debug, and scales linearly with the number of changes rather than the total dataset size.

The server timestamp — not the client timestamp — is the anchor. Client device clocks can be wrong, manually adjusted, or in different time zones. If you sync based on the client clock, a user who sets their phone's clock back by an hour might miss an hour of changes forever. The server is the authoritative time source, and every client agrees on "what changed since when" based on that single clock. The sync response includes the server's current timestamp, which the client stores and sends back on the next sync. This also eliminates problems with daylight saving transitions and locale-specific date handling that would otherwise plague a client-clock approach.

A well-designed sync API separates changes into three categories: created records, updated records, and deleted records. The server must track deletions explicitly through soft deletes — marking a record with a `deletedAt` timestamp rather than physically removing it from the database. Without soft deletes, the server has no way to tell the client "this record was removed since your last sync." Soft-deleted records can be purged after a retention window (for example, 90 days), but any client that hasn't synced in that window needs a full resync.

```kotlin
data class SyncResponse(
    val created: List<SyncRecord>,
    val updated: List<SyncRecord>,
    val deleted: List<DeletedRecord>,
    val serverTimestamp: Long,
    val hasMore: Boolean,
)

data class SyncRecord(
    val id: String,
    val data: JsonObject,
    val modifiedAt: Long,
)

data class DeletedRecord(
    val id: String,
    val deletedAt: Long,
)

interface SyncApi {
    @GET("sync/changes")
    suspend fun getChanges(
        @Query("since") since: Long,
        @Query("limit") limit: Int = 500,
    ): SyncResponse
}
```

Applying changes atomically in a Room transaction is critical. If the sync applies 50 inserts and 30 updates but crashes on delete number 15, you need the entire operation to roll back. Otherwise, the database is in a partially synced state — some deletes applied, others didn't — and the stored timestamp says "synced up to this point" even though it hasn't. Wrapping everything in `database.withTransaction` ensures it is all-or-nothing. The timestamp update happens inside the same transaction, so a failure at any point means the next sync retries the full batch.

Pagination is essential for large change sets. If a user hasn't synced for weeks, the server might have thousands of changes. Returning them all in a single response risks OOM crashes on the client and timeouts on the server. The server should support a `limit` parameter and a `hasMore` flag. The client syncs in pages, committing each page in its own transaction with an intermediate timestamp, until `hasMore` is false.

```kotlin
class PullSyncManager(
    private val api: SyncApi,
    private val dao: SyncDao,
    private val database: AppDatabase,
) {
    suspend fun sync(): SyncResult {
        var lastSyncTimestamp = dao.getLastSyncTimestamp() ?: 0L
        var totalCreated = 0
        var totalUpdated = 0
        var totalDeleted = 0

        return try {
            do {
                val changes = api.getChanges(since = lastSyncTimestamp)

                database.withTransaction {
                    changes.created.forEach { dao.insert(it.toEntity()) }
                    changes.updated.forEach { dao.upsert(it.toEntity()) }
                    changes.deleted.forEach { dao.deleteById(it.id) }
                    dao.setLastSyncTimestamp(changes.serverTimestamp)
                }

                totalCreated += changes.created.size
                totalUpdated += changes.updated.size
                totalDeleted += changes.deleted.size
                lastSyncTimestamp = changes.serverTimestamp
            } while (changes.hasMore)

            SyncResult.Success(
                created = totalCreated,
                updated = totalUpdated,
                deleted = totalDeleted,
            )
        } catch (e: Exception) {
            SyncResult.Failure(e)
        }
    }
}

sealed class SyncResult {
    data class Success(val created: Int, val updated: Int, val deleted: Int) : SyncResult()
    data class Failure(val error: Exception) : SyncResult()
}
```

Tracking sync state persistently is what makes pull-based sync reliable across app restarts, process death, and device reboots. The sync timestamp should live in Room alongside the synced data, not in SharedPreferences or DataStore. Keeping it in Room means the timestamp and data are always consistent — if a transaction rolls back, the timestamp rolls back too. A separate `sync_metadata` table stores the last successful timestamp per entity type, enabling independent sync schedules for different data categories.

```kotlin
@Entity(tableName = "sync_metadata")
data class SyncMetadata(
    @PrimaryKey val entityType: String,
    val lastSyncTimestamp: Long,
    val lastSyncStatus: String,
    val recordsSynced: Int,
)

@Dao
interface SyncDao {
    @Query("SELECT lastSyncTimestamp FROM sync_metadata WHERE entityType = :type")
    suspend fun getLastSyncTimestamp(type: String = "default"): Long?

    @Upsert
    suspend fun upsert(entity: NoteEntity)

    @Query("DELETE FROM notes WHERE id = :id")
    suspend fun deleteById(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun setSyncMetadata(metadata: SyncMetadata)

    @Transaction
    suspend fun setLastSyncTimestamp(timestamp: Long, type: String = "default") {
        setSyncMetadata(
            SyncMetadata(
                entityType = type,
                lastSyncTimestamp = timestamp,
                lastSyncStatus = "SUCCESS",
                recordsSynced = 0,
            )
        )
    }
}
```

For scheduling periodic sync, WorkManager is the right tool. It guarantees execution even after process death and respects system constraints like network availability. Use `PeriodicWorkRequestBuilder` with a minimum interval of 15 minutes, exponential backoff for retries, and `ExistingPeriodicWorkPolicy.KEEP` to avoid stacking duplicate work requests. The sync frequency should be configurable — a messaging app might sync every 15 minutes while a read-heavy reference app syncs once a day.

```kotlin
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
```

#### Common Mistakes

Developers often use the client device clock instead of the server-provided timestamp for sync anchoring. This leads to missed changes when users travel across time zones, manually adjust their clock, or when the device clock drifts. Always store and send back the timestamp the server gave you.

Another frequent mistake is not using soft deletes on the server. If the server physically removes a row, there is no record of the deletion. The client still has the old row in its local database and never knows to remove it. The data reappears like a ghost after every sync, creating confusion and data inconsistencies.

Skipping pagination is a third pitfall. Without a `limit` and `hasMore` mechanism, a client that hasn't synced in a month might request tens of thousands of records in a single API call. This can trigger OOM errors when parsing the response, exhaust the device's memory, and cause network timeouts that make sync permanently impossible until someone manually clears the app data.

Finally, developers sometimes store the sync timestamp in SharedPreferences separate from the Room database. This creates a race condition: the data transaction commits but the SharedPreferences write fails (or vice versa), leaving the sync state inconsistent with the actual data. Always store sync metadata inside the same Room database and within the same transaction as the data changes.

**Key takeaway:** Pull-based sync uses server timestamps as the anchor, applies changes atomically in a database transaction, and schedules periodic syncs with WorkManager. Always use the server's timestamp, never the client's.

### Lesson 6.2: Push-Based Sync with WebSocket

While pull-based sync works well for most apps, some features demand real-time data: chat messages, collaborative editing, live scores, typing indicators. Push-based sync uses a persistent connection — usually WebSocket — where the server sends updates as they happen. The client does not need to poll; it receives events the moment they occur on the server. This eliminates the latency inherent in polling intervals and reduces unnecessary network requests when nothing has changed. WebSocket is a full-duplex protocol built on top of a single TCP connection, meaning data flows in both directions simultaneously without the overhead of repeated HTTP handshakes.

The architecture has three components: the WebSocket connection manager that handles connection lifecycle, reconnection, and heartbeats; the event dispatcher that parses incoming events and routes them to the appropriate handler; and the local persistence layer that writes events to Room so the UI always reads from the database, not directly from the WebSocket. This last point is crucial — even with push-based sync, the database remains the single source of truth. WebSocket events are persisted to Room, and the UI observes Room via Flow or LiveData. This ensures consistency during reconnection gaps and process death. If the UI consumed WebSocket events directly, any events received while the UI was not observing (during configuration changes, background state, or process death) would be permanently lost.

OkHttp provides a robust WebSocket implementation through its `WebSocketListener` API. The client creates a standard HTTP request with a WebSocket URL (using the `wss://` scheme for TLS-secured connections), and OkHttp handles the protocol upgrade from HTTP to WebSocket transparently. Setting a `pingInterval` on the `OkHttpClient` enables automatic heartbeat pings that detect dead connections before the operating system's TCP timeout, which can take minutes. Without heartbeats, a mobile device switching from Wi-Fi to cellular might maintain a dead socket for an extended period, silently missing events.

```kotlin
class WebSocketManager(
    private val url: String,
    private val tokenProvider: TokenProvider,
    private val eventDispatcher: EventDispatcher,
    private val scope: CoroutineScope,
) {
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private var reconnectAttempt = 0
    private val maxReconnectDelay = 30_000L
    private var reconnectJob: Job? = null

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
            reconnectJob?.cancel()
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
            if (code != 1000) scheduleReconnect()
        }
    }

    fun disconnect() {
        reconnectJob?.cancel()
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        _connectionState.value = ConnectionState.Disconnected
    }
}

sealed class ConnectionState {
    data object Connecting : ConnectionState()
    data object Connected : ConnectionState()
    data object Disconnected : ConnectionState()
}
```

Connection lifecycle management is the hardest part of WebSocket integration. You need to handle initial connection with authentication, automatic reconnection with exponential backoff when the connection drops, heartbeat pings to detect dead connections before the OS does, buffering events during reconnection through a server-side catch-up mechanism, and graceful shutdown when the app is backgrounded. Exponential backoff prevents a thundering herd problem where thousands of clients simultaneously reconnect after a server restart, overwhelming the server before it stabilizes. The backoff delay doubles with each attempt but is capped at a maximum (typically 30 seconds) to avoid excessively long reconnection waits.

```kotlin
private fun scheduleReconnect() {
    reconnectJob?.cancel()
    val delay = (1000L * (1 shl reconnectAttempt.coerceAtMost(5)))
        .coerceAtMost(maxReconnectDelay)
    reconnectAttempt++

    reconnectJob = scope.launch {
        delay(delay)
        if (_connectionState.value is ConnectionState.Disconnected) {
            connect()
        }
    }
}

private fun sendCatchUpRequest() {
    val lastEventId = eventDispatcher.getLastProcessedEventId()
    val catchUpMessage = buildJsonObject {
        put("type", "catch_up")
        put("sinceEventId", lastEventId)
    }.toString()
    webSocket?.send(catchUpMessage)
}
```

The event dispatcher deserializes incoming JSON messages into typed event objects and routes them to registered handlers. Each handler is responsible for persisting the event to Room inside a transaction. Persisting first and notifying the UI second ensures no events are lost. The dispatcher should also track the last processed event ID so the catch-up mechanism knows where to resume after a reconnection. Using a sealed class for events provides compile-time exhaustiveness checking, ensuring every event type is handled.

```kotlin
class EventDispatcher(
    private val dao: EventDao,
    private val database: AppDatabase,
) {
    private var lastProcessedEventId: String? = null

    fun getLastProcessedEventId(): String? = lastProcessedEventId

    suspend fun dispatch(event: SyncEvent) {
        database.withTransaction {
            when (event) {
                is SyncEvent.RecordCreated -> dao.insert(event.record.toEntity())
                is SyncEvent.RecordUpdated -> dao.upsert(event.record.toEntity())
                is SyncEvent.RecordDeleted -> dao.deleteById(event.recordId)
                is SyncEvent.BatchUpdate -> {
                    event.records.forEach { dao.upsert(it.toEntity()) }
                }
            }
            lastProcessedEventId = event.eventId
            dao.saveLastEventId(event.eventId)
        }
    }
}

sealed class SyncEvent(val eventId: String) {
    class RecordCreated(eventId: String, val record: SyncRecord) : SyncEvent(eventId)
    class RecordUpdated(eventId: String, val record: SyncRecord) : SyncEvent(eventId)
    class RecordDeleted(eventId: String, val recordId: String) : SyncEvent(eventId)
    class BatchUpdate(eventId: String, val records: List<SyncRecord>) : SyncEvent(eventId)
}
```

Tying the WebSocket lifecycle to the Android activity lifecycle prevents resource leaks and unnecessary battery drain. Connect when the app enters the foreground and disconnect when it enters the background. A `DefaultLifecycleObserver` registered on the `ProcessLifecycleOwner` handles this cleanly. For apps that need background push updates (like messaging), use Firebase Cloud Messaging to wake the app and trigger a pull-based catch-up sync rather than keeping a WebSocket alive in the background, which Android's battery optimization will eventually kill anyway.

```kotlin
class WebSocketLifecycleObserver(
    private val webSocketManager: WebSocketManager,
) : DefaultLifecycleObserver {

    override fun onStart(owner: LifecycleOwner) {
        webSocketManager.connect()
    }

    override fun onStop(owner: LifecycleOwner) {
        webSocketManager.disconnect()
    }
}

// In Application.onCreate()
// ProcessLifecycleOwner.get().lifecycle.addObserver(
//     WebSocketLifecycleObserver(webSocketManager)
// )
```

#### Common Mistakes

The most common mistake is consuming WebSocket events directly in the UI layer without persisting them to Room first. When the UI observes a WebSocket stream directly, any events received during a configuration change (screen rotation), while the app is in the background, or after process death are permanently lost. Always write events to Room and let the UI observe Room.

Another frequent error is not implementing a catch-up mechanism. When the WebSocket reconnects after a disconnection, there is a gap of missed events. Without catch-up, the client's local data silently diverges from the server. The server must support an endpoint or message type that returns all events since a given event ID so the client can fill in the gap on reconnection.

Developers also commonly forget to cancel the reconnection coroutine when the user explicitly disconnects. This leads to the WebSocket reconnecting immediately after the app calls `disconnect()`, creating a loop where the connection opens and closes repeatedly. Always cancel pending reconnection jobs in the `disconnect()` method.

Using an unscoped `CoroutineScope(Dispatchers.IO)` for reconnection is another pitfall. If the scope is not tied to the component's lifecycle, reconnection coroutines can leak and continue running after the component is destroyed. Use a structured scope injected from the parent component so cancellation propagates properly.

**Key takeaway:** Push-based sync provides real-time updates through persistent WebSocket connections. Even with push sync, the database remains the single source of truth — WebSocket events are persisted to Room, not consumed directly by the UI. Handle reconnection with exponential backoff and catch-up mechanisms.

### Lesson 6.3: Conflict Resolution Strategies

Conflicts arise when the same data is modified in two places before either change is synced. User A changes a note title on their phone while offline. Meanwhile, User B changes the same note title on their tablet. When both devices sync, the server receives two competing changes for the same field. The conflict resolution strategy determines which change wins and how the system converges to a consistent state. Conflict resolution is not just an edge case — in any app with offline support and multi-device usage, conflicts are inevitable and the system must handle them gracefully without losing user data or creating confusing UI states.

The four main strategies are Server Wins, Client Wins, Last Write Wins, and Manual Resolution. Server Wins means the server's version always takes priority — it is the simplest strategy and works well for reference data that the server controls, but it can silently discard user changes. Client Wins means the client's local version always takes priority — this is risky because it can overwrite changes from other devices without warning. Last Write Wins means the most recent change wins based on timestamps — it is pragmatic and widely used, but clock skew can cause unexpected results if using client timestamps. Manual Resolution flags the conflict and lets the user choose — it is the most correct approach but the most complex to implement, and users generally dislike being asked to resolve conflicts they don't understand.

For most mobile apps, Last Write Wins is the pragmatic choice. It preserves the most recent user intent regardless of which device made the change. The implementation requires accurate timestamps — use server-issued timestamps rather than client clocks to avoid clock skew issues. When the client sends a change to the server, the server stamps it with its own clock and uses that timestamp for ordering. This ensures that all clients agree on the ordering of events even if their local clocks differ by minutes or hours.

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

Version-based conflict detection is more robust than timestamp-based detection. Each record carries a version number that increments on every write. When the client sends an update, it includes the version it read. The server checks whether the record's current version matches — if it does, the update succeeds and the version increments. If it does not, another client has modified the record in the meantime, and the server rejects the update with a conflict response. This is optimistic concurrency control, and it catches conflicts deterministically without relying on timestamp accuracy.

```kotlin
class VersionedSyncManager(
    private val api: SyncApi,
    private val dao: SyncDao,
    private val conflictResolver: ConflictResolver,
    private val database: AppDatabase,
) {
    suspend fun pushLocalChanges(): PushResult {
        val pendingChanges = dao.getPendingChanges()
        val conflicts = mutableListOf<ConflictRecord>()
        val successes = mutableListOf<String>()

        for (change in pendingChanges) {
            val response = api.pushChange(
                id = change.id,
                data = change.toRequest(),
                expectedVersion = change.version,
            )

            when (response) {
                is PushResponse.Success -> {
                    dao.updateVersion(change.id, response.newVersion)
                    dao.clearPendingFlag(change.id)
                    successes.add(change.id)
                }
                is PushResponse.Conflict -> {
                    val result = conflictResolver.resolve(change, response.serverRecord)
                    when (result) {
                        is ConflictResult.Resolved -> {
                            dao.upsert(result.winner.toEntity())
                            dao.clearPendingFlag(change.id)
                        }
                        is ConflictResult.NeedsUserInput -> {
                            conflicts.add(ConflictRecord(change, response.serverRecord))
                        }
                    }
                }
            }
        }

        return PushResult(successes = successes.size, conflicts = conflicts)
    }
}

data class ConflictRecord(val local: SyncableEntity, val remote: SyncableEntity)
```

For collaborative apps where data loss is unacceptable — document editors, shared lists, inventory systems — consider field-level merge or CRDTs (Conflict-free Replicated Data Types). Field-level merge detects which specific fields changed on each side and merges non-overlapping changes automatically. If User A changes the title and User B changes the body, both changes can be applied without conflict. Only when both users change the same field does a true conflict exist. CRDTs go further by using data structures that are mathematically guaranteed to converge regardless of the order operations are applied. A G-Counter (grow-only counter), for example, tracks increments per device and sums them — two devices incrementing simultaneously always produce the correct total.

```kotlin
class FieldLevelMerger {
    fun merge(
        base: Map<String, Any?>,
        local: Map<String, Any?>,
        remote: Map<String, Any?>,
    ): MergeResult {
        val merged = base.toMutableMap()
        val conflicts = mutableMapOf<String, FieldConflict>()

        val localChanges = local.filter { (k, v) -> base[k] != v }
        val remoteChanges = remote.filter { (k, v) -> base[k] != v }

        remoteChanges.forEach { (field, value) ->
            if (field !in localChanges) {
                merged[field] = value
            } else if (localChanges[field] != value) {
                conflicts[field] = FieldConflict(
                    field = field,
                    baseValue = base[field],
                    localValue = localChanges[field],
                    remoteValue = value,
                )
            }
        }

        localChanges.forEach { (field, value) ->
            if (field !in remoteChanges) {
                merged[field] = value
            }
        }

        return if (conflicts.isEmpty()) {
            MergeResult.AutoMerged(merged)
        } else {
            MergeResult.HasConflicts(merged, conflicts)
        }
    }
}

data class FieldConflict(
    val field: String,
    val baseValue: Any?,
    val localValue: Any?,
    val remoteValue: Any?,
)

sealed class MergeResult {
    data class AutoMerged(val merged: Map<String, Any?>) : MergeResult()
    data class HasConflicts(
        val partialMerge: Map<String, Any?>,
        val conflicts: Map<String, FieldConflict>,
    ) : MergeResult()
}
```

When manual resolution is necessary, the conflict must be surfaced to the user in a way that is clear and actionable. Store unresolved conflicts in a dedicated database table with both versions and metadata about when and where each change was made. Show a diff-style UI that highlights the differences between the two versions. Let the user pick one version, merge fields manually, or dismiss the conflict. Never block the user's workflow — unresolved conflicts should be a non-intrusive notification, not a modal dialog that prevents all other interaction.

```kotlin
@Entity(tableName = "unresolved_conflicts")
data class UnresolvedConflict(
    @PrimaryKey val id: String,
    val entityId: String,
    val entityType: String,
    val localData: String,
    val remoteData: String,
    val localModifiedAt: Long,
    val remoteModifiedAt: Long,
    val detectedAt: Long = System.currentTimeMillis(),
)

@Dao
interface ConflictDao {
    @Query("SELECT * FROM unresolved_conflicts ORDER BY detectedAt DESC")
    fun observeConflicts(): Flow<List<UnresolvedConflict>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertConflict(conflict: UnresolvedConflict)

    @Query("DELETE FROM unresolved_conflicts WHERE id = :id")
    suspend fun resolveConflict(id: String)

    @Query("SELECT COUNT(*) FROM unresolved_conflicts")
    fun observeConflictCount(): Flow<Int>
}
```

#### Common Mistakes

The most common mistake is ignoring conflicts entirely and blindly overwriting data. Developers assume conflicts are rare and simply use `INSERT OR REPLACE` without checking versions or timestamps. This silently discards user changes and erodes trust in the app when users notice their edits disappearing.

Another frequent error is using client-side timestamps for Last Write Wins ordering. If one device's clock is five minutes ahead, its changes always win regardless of when the user actually made the edit. Always use server-issued timestamps for conflict ordering to ensure fairness across devices.

Implementing field-level merge without a common base version is a third pitfall. Without knowing the original state both changes diverged from, you cannot distinguish between "User A changed this field" and "User A left this field unchanged." The three-way merge requires the base version, the local version, and the remote version — skipping the base makes accurate merging impossible.

Finally, developers sometimes apply conflict resolution asynchronously without notifying the user. If a conflict is auto-resolved and the user's local change is discarded, the user should at minimum see a notification explaining that their change was superseded by a newer edit from another device. Silent resolution breeds confusion.

Understanding when conflicts actually occur helps you choose the right resolution strategy. For most mobile apps, conflicts are rare — users typically use one device at a time.

Server Wins: always keep the server version. Appropriate for inventory counts, pricing, admin-managed content. Downside: local edits are silently discarded.

Client Wins: always keep the local version. Appropriate for personal settings or preferences. Downside: changes from other devices are discarded.

Last Write Wins: compare timestamps and keep the most recent change. Most common strategy. Critical requirement: use server-issued timestamps to avoid clock skew.

Manual resolution: present both versions to the user. Most correct but most complex. Appropriate for high-value content.

```kotlin
class FieldLevelConflictResolver {
    fun <T : Syncable> resolveFields(
        local: T,
        remote: T,
        fieldStrategies: Map<String, ConflictStrategy>,
    ): T {
        var result = remote
        fieldStrategies.forEach { (field, strategy) ->
            val localValue = getField(local, field)
            val remoteValue = getField(remote, field)
            val resolved = when (strategy) {
                ConflictStrategy.LastWriteWins -> if (local.modifiedAt > remote.modifiedAt) localValue else remoteValue
                ConflictStrategy.ServerWins -> remoteValue
                ConflictStrategy.ClientWins -> localValue
                else -> remoteValue
            }
            result = setField(result, field, resolved)
        }
        return result
    }
}
```

For collaborative apps where data loss is unacceptable, CRDTs offer eventual consistency without conflicts. A CRDT is a data structure where any two concurrent modifications can be merged automatically.

```kotlin
class GCounter(private val nodeId: String) {
    private val counts = mutableMapOf<String, Long>()

    fun increment() { counts[nodeId] = (counts[nodeId] ?: 0L) + 1 }
    fun value(): Long = counts.values.sum()

    fun merge(other: GCounter): GCounter {
        val merged = GCounter(nodeId)
        val allNodes = counts.keys + other.counts.keys
        allNodes.forEach { node ->
            merged.counts[node] = maxOf(counts[node] ?: 0L, other.counts[node] ?: 0L)
        }
        return merged
    }
}
```

**Key takeaway:** Most apps can use Last Write Wins conflict resolution based on server-issued timestamps. Manual conflict resolution is correct but complex and rarely needed. Choose the simplest strategy that meets your data integrity requirements.

### Lesson 6.4: Delta Sync and Bandwidth Optimization

Full sync — fetching the entire dataset on every sync — wastes bandwidth and battery. Delta sync fetches only the changes since the last sync, dramatically reducing payload size. A user with 10,000 notes where 3 changed since last sync should receive 3 records, not 10,000. The implementation requires the server to support change tracking (either through timestamps, version numbers, or a changelog table) and the client to track its sync position. Delta sync is especially important on mobile where users may be on metered cellular connections with data caps, and where every byte transmitted costs battery through the cellular radio.

The sync payload format matters for bandwidth. Instead of sending full entities for every change, send only the changed fields — this is called field-level deltas. A note where only the title changed should transmit the note ID, the new title, and the modification timestamp, not the entire note body, tags, metadata, and attachment references. This is especially impactful for entities with large text fields or binary data. The tradeoff is implementation complexity: field-level deltas require schema awareness on both client and server, and applying partial updates to the local database is more complex than replacing entire rows.

The server-side changelog pattern provides a clean foundation for delta sync. Instead of querying every table for records with `modified_at > lastSync`, the server maintains a dedicated changelog table that records every mutation with an auto-incrementing version number. The client requests changes since its last known version, and the server returns the changelog entries. This is more efficient than timestamp queries because it avoids scanning large tables, handles the case where multiple changes happen at the exact same millisecond, and naturally supports pagination through sequential version numbers.

```kotlin
class DeltaSyncManager(
    private val api: SyncApi,
    private val dao: SyncableDao,
    private val database: AppDatabase,
) {
    suspend fun deltaSync(entityType: String): DeltaSyncResult {
        val lastVersion = dao.getLastSyncVersion(entityType) ?: 0

        val delta = api.getDelta(
            entityType = entityType,
            sinceVersion = lastVersion,
        )

        database.withTransaction {
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

Applying partial updates in Room requires dynamic query construction or a helper method that maps changed fields to column updates. A generic `applyPartialUpdate` method takes a record ID and a map of field names to new values, then constructs the appropriate SQL update. Using `SupportSQLiteQuery` with `SimpleSQLiteQuery` allows building dynamic queries safely with bound parameters, avoiding SQL injection while supporting arbitrary field combinations.

```kotlin
@Dao
abstract class SyncableDao {
    @RawQuery
    abstract suspend fun execUpdate(query: SupportSQLiteQuery): Int

    suspend fun applyPartialUpdate(id: String, fields: Map<String, Any?>) {
        if (fields.isEmpty()) return

        val setClauses = fields.keys.joinToString(", ") { "$it = ?" }
        val args = fields.values.toList() + id
        val query = SimpleSQLiteQuery(
            "UPDATE syncable_entities SET $setClauses WHERE id = ?",
            args.toTypedArray(),
        )
        execUpdate(query)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insert(entity: SyncableEntity)

    @Query("DELETE FROM syncable_entities WHERE id = :id")
    abstract suspend fun deleteById(id: String)

    @Query("SELECT lastVersion FROM sync_versions WHERE entityType = :type")
    abstract suspend fun getLastSyncVersion(type: String): Int?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun saveSyncVersion(version: SyncVersion)

    suspend fun setLastSyncVersion(type: String, version: Int) {
        saveSyncVersion(SyncVersion(entityType = type, lastVersion = version))
    }
}

@Entity(tableName = "sync_versions")
data class SyncVersion(
    @PrimaryKey val entityType: String,
    val lastVersion: Int,
)
```

For further bandwidth optimization, use HTTP compression, connection pooling, and response streaming. OkHttp supports gzip and brotli compression transparently — the server compresses the response body, and OkHttp decompresses it on the client. For bulk sync responses that could be megabytes, use streaming JSON parsing with Moshi's `JsonReader` instead of buffering the entire response into memory. Streaming parsing processes records one at a time, keeping memory usage constant regardless of response size. On metered connections, batch small syncs into fewer larger requests to minimize the overhead of repeated TLS handshakes and HTTP headers.

```kotlin
class BandwidthOptimizedSync(
    private val client: OkHttpClient,
    private val dao: SyncableDao,
    private val database: AppDatabase,
) {
    private val moshi = Moshi.Builder().build()

    suspend fun streamingSync(url: String) = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(url)
            .header("Accept-Encoding", "gzip, br")
            .build()

        client.newCall(request).execute().use { response ->
            val source = response.body?.source() ?: return@withContext
            val reader = JsonReader.of(source)

            reader.beginArray()
            database.withTransaction {
                while (reader.hasNext()) {
                    val record = parseRecord(reader)
                    dao.insert(record)
                }
            }
            reader.endArray()
        }
    }

    private fun parseRecord(reader: JsonReader): SyncableEntity {
        var id = ""
        var data = ""
        var version = 0

        reader.beginObject()
        while (reader.hasNext()) {
            when (reader.nextName()) {
                "id" -> id = reader.nextString()
                "data" -> data = reader.nextString()
                "version" -> version = reader.nextInt()
                else -> reader.skipValue()
            }
        }
        reader.endObject()

        return SyncableEntity(id = id, data = data, version = version)
    }
}
```

Sync frequency should adapt to network conditions and connection type. On unmetered Wi-Fi, sync aggressively with full payloads. On metered cellular, reduce sync frequency and use aggressive delta compression. When the device is on a slow or expensive connection, defer non-critical syncs entirely and only push urgent changes. Android's `ConnectivityManager` provides the information needed to make these decisions, and WorkManager constraints can enforce network type requirements at the system level.

```kotlin
class AdaptiveSyncScheduler(
    private val connectivityManager: ConnectivityManager,
    private val workManager: WorkManager,
) {
    fun scheduleSyncBasedOnNetwork() {
        val capabilities = connectivityManager.activeNetwork?.let {
            connectivityManager.getNetworkCapabilities(it)
        }

        val isUnmetered = capabilities
            ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true

        val syncConfig = if (isUnmetered) {
            SyncConfig(
                intervalMinutes = 15,
                fullSync = true,
                networkType = NetworkType.UNMETERED,
            )
        } else {
            SyncConfig(
                intervalMinutes = 60,
                fullSync = false,
                networkType = NetworkType.CONNECTED,
            )
        }

        val request = PeriodicWorkRequestBuilder<SyncWorker>(
            syncConfig.intervalMinutes.toLong(), TimeUnit.MINUTES,
        )
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(syncConfig.networkType)
                    .build()
            )
            .setInputData(
                workDataOf("fullSync" to syncConfig.fullSync)
            )
            .build()

        workManager.enqueueUniquePeriodicWork(
            "adaptive_sync",
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }
}

data class SyncConfig(
    val intervalMinutes: Int,
    val fullSync: Boolean,
    val networkType: NetworkType,
)
```

#### Common Mistakes

The most common mistake is sending full entity payloads when only a single field changed. A note entity with a 50KB body field, ten metadata fields, and attachment references should not be retransmitted in its entirety because the user changed the title. Implementing field-level deltas requires more work upfront but saves orders of magnitude in bandwidth over the app's lifetime.

Another frequent error is not compressing sync payloads. JSON is highly compressible — typical sync responses compress by 70-90% with gzip. OkHttp handles decompression automatically, but the server must be configured to compress responses. Developers often forget this server-side configuration and unknowingly transmit uncompressed JSON over cellular connections.

Buffering entire sync responses into memory before processing is a third pitfall. A sync response with 10,000 records could be tens of megabytes after decompression. Parsing the entire response into a `List<Record>` allocates memory for all records simultaneously. Streaming JSON parsing processes one record at a time and keeps memory usage constant.

Developers also frequently forget to handle the "too far behind" case. If a client hasn't synced in months and the server's changelog has been pruned, delta sync is impossible. The server should return a signal (like a `requiresFullSync` flag) telling the client to perform a full sync instead, and the client must handle this gracefully.

The sync payload format matters for bandwidth. Instead of sending full entities for every change, send only changed fields (field-level deltas). A note where only the title changed should transmit the note ID, the new title, and the modification timestamp — not the entire note body.

The implementation of field-level deltas requires careful coordination. The server must track which fields changed. The client must apply partial updates without overwriting unchanged fields.

```kotlin
@Dao
interface NoteDao {
    @Upsert
    suspend fun upsert(note: NoteEntity)

    @Query("UPDATE notes SET title = :title, modified_at = :modifiedAt WHERE id = :id")
    suspend fun updateTitle(id: String, title: String, modifiedAt: Long)

    @Query("UPDATE notes SET content = :content, modified_at = :modifiedAt WHERE id = :id")
    suspend fun updateContent(id: String, content: String, modifiedAt: Long)
}

class DeltaApplier(private val dao: NoteDao) {
    suspend fun applyDelta(delta: DeltaChange) {
        when (delta.operation) {
            ChangeOperation.INSERT -> dao.upsert(delta.entity)
            ChangeOperation.DELETE -> dao.deleteById(delta.entity.id)
            ChangeOperation.UPDATE -> {
                delta.changedFields.forEach { (field, value) ->
                    when (field) {
                        "title" -> dao.updateTitle(delta.entity.id, value as String, delta.entity.modifiedAt)
                        "content" -> dao.updateContent(delta.entity.id, value as String, delta.entity.modifiedAt)
                    }
                }
            }
        }
    }
}
```

#### Design Pitfalls

The main pitfall with delta sync is handling the initial sync case. The first login has no "since" timestamp. The server must support full sync for initial load and delta mode for subsequent syncs.

Another pitfall is version number gaps. If the server's changelog only retains recent versions, clients that have not synced in a long time may need to fall back to full sync.

**Key takeaway:** Delta sync fetches only changes since the last sync, saving bandwidth and battery. Use field-level deltas for large entities and HTTP compression for all sync traffic. Track sync position with server-side version numbers.

### Lesson 6.5: WorkManager for Reliable Background Sync

WorkManager is the correct tool for scheduling reliable background sync on Android. Unlike coroutines launched in a ViewModel scope (which die with the Activity) or foreground services (which require a persistent notification), WorkManager guarantees work execution even if the app is killed, the device restarts, or the user force-stops the app. It respects system constraints like network availability, battery level, and storage space. WorkManager persists work requests in an internal SQLite database, so pending work survives process death and device reboots. The system scheduler runs the work when all constraints are satisfied, using JobScheduler on API 23+ and a combination of AlarmManager and BroadcastReceiver on older devices.

For sync operations, use `PeriodicWorkRequest` for regular background sync with a minimum interval of 15 minutes, and `OneTimeWorkRequest` for immediate sync triggered by user action. Chain work requests for multi-step sync flows — first sync user data, then sync messages, then sync media. Each step can have its own constraints and retry policy. If any step fails, the chain halts and can be retried. The chaining mechanism is powerful for complex sync orchestration where order matters: you might need to sync authentication tokens before syncing user data, or sync metadata before syncing binary attachments.

The SyncWorker itself should be idempotent — running it twice with the same state should produce the same result. This is important because WorkManager may retry the worker if it fails, and in rare cases may run it even after it succeeds due to system rescheduling. Idempotency means using upsert operations instead of inserts, tracking sync position with server timestamps, and not relying on in-memory state. A worker that inserts a record without checking for duplicates will create multiple copies if retried. A worker that uses upsert will simply overwrite the same record, producing the correct outcome regardless of how many times it runs.

```kotlin
class SyncWorker(
    context: Context,
    params: WorkerParameters,
    private val syncManager: PullSyncManager,
    private val notificationHelper: SyncNotificationHelper,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val isFullSync = inputData.getBoolean("fullSync", false)

        return try {
            setForeground(createForegroundInfo())

            val result = syncManager.sync()
            when (result) {
                is SyncResult.Success -> {
                    notificationHelper.notifySyncComplete(result)
                    Result.success(
                        workDataOf(
                            "created" to result.created,
                            "updated" to result.updated,
                            "deleted" to result.deleted,
                        )
                    )
                }
                is SyncResult.Failure -> {
                    if (runAttemptCount < 3) Result.retry()
                    else Result.failure(
                        workDataOf("error" to result.error.message)
                    )
                }
            }
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry()
            else Result.failure(
                workDataOf("error" to e.message)
            )
        }
    }

    private fun createForegroundInfo(): ForegroundInfo {
        val notification = notificationHelper.buildSyncNotification()
        return ForegroundInfo(SYNC_NOTIFICATION_ID, notification)
    }

    companion object {
        private const val SYNC_NOTIFICATION_ID = 1001
    }
}
```

Dependency injection with WorkManager requires a custom `WorkerFactory`. Since workers are instantiated by the system, you cannot pass constructor parameters directly. Hilt provides `HiltWorker` and `@AssistedInject` to handle this cleanly. The worker's dependencies (sync manager, DAOs, repositories) are injected by the DI framework, and the `Context` and `WorkerParameters` are provided by the system through the `@Assisted` annotation. Without this setup, you would need to use service locators or global singletons to access dependencies inside workers, which is harder to test and violates structured dependency management.

```kotlin
@HiltWorker
class HiltSyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val syncManager: PullSyncManager,
    private val syncStateTracker: SyncStateTracker,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        syncStateTracker.onSyncStarted()

        return try {
            val result = syncManager.sync()
            when (result) {
                is SyncResult.Success -> {
                    syncStateTracker.onSyncCompleted(result)
                    Result.success()
                }
                is SyncResult.Failure -> {
                    syncStateTracker.onSyncFailed(result.error)
                    if (runAttemptCount < 3) Result.retry()
                    else Result.failure()
                }
            }
        } catch (e: Exception) {
            syncStateTracker.onSyncFailed(e)
            if (runAttemptCount < 3) Result.retry()
            else Result.failure()
        }
    }
}
```

Tracking sync state is essential for providing user-facing feedback and debugging sync issues in production. A `SyncStateTracker` records when each sync started, whether it succeeded or failed, how many records were affected, and the error message if it failed. This state is stored in Room (not in-memory) so it persists across process restarts. The UI observes this state through a Flow to show sync indicators — a spinning icon during sync, a checkmark after success, or an error banner after failure. In production, logging sync metrics to your analytics backend helps identify patterns like consistently failing syncs for specific users or entity types.

```kotlin
class SyncStateTracker(private val dao: SyncStateDao) {
    private val _syncState = MutableStateFlow<SyncState>(SyncState.Idle)
    val syncState: StateFlow<SyncState> = _syncState.asStateFlow()

    suspend fun onSyncStarted() {
        _syncState.value = SyncState.Syncing
        dao.insertSyncEvent(
            SyncEvent(status = "STARTED", timestamp = System.currentTimeMillis())
        )
    }

    suspend fun onSyncCompleted(result: SyncResult.Success) {
        _syncState.value = SyncState.Success(
            lastSyncTime = System.currentTimeMillis(),
            recordsAffected = result.created + result.updated + result.deleted,
        )
        dao.insertSyncEvent(
            SyncEvent(
                status = "COMPLETED",
                timestamp = System.currentTimeMillis(),
                recordsAffected = result.created + result.updated + result.deleted,
            )
        )
    }

    suspend fun onSyncFailed(error: Throwable) {
        _syncState.value = SyncState.Error(error.message ?: "Unknown error")
        dao.insertSyncEvent(
            SyncEvent(
                status = "FAILED",
                timestamp = System.currentTimeMillis(),
                errorMessage = error.message,
            )
        )
    }
}

sealed class SyncState {
    data object Idle : SyncState()
    data object Syncing : SyncState()
    data class Success(val lastSyncTime: Long, val recordsAffected: Int) : SyncState()
    data class Error(val message: String) : SyncState()
}

@Entity(tableName = "sync_events")
data class SyncEvent(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val status: String,
    val timestamp: Long,
    val recordsAffected: Int = 0,
    val errorMessage: String? = null,
)
```

Chaining multiple sync operations with WorkManager ensures dependent tasks execute in the correct order with proper error propagation. Use `WorkManager.beginWith()` and `.then()` to create a chain where each step only runs if the previous step succeeded. This is ideal for multi-entity sync flows where user profile data must sync before messages, and messages must sync before attachments. Each worker in the chain can pass output data to the next worker through `workDataOf`, enabling the chain to share context like sync timestamps or batch identifiers.

```kotlin
object SyncScheduler {
    fun scheduleFullSync(workManager: WorkManager) {
        val networkConstraint = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val userSync = OneTimeWorkRequestBuilder<UserSyncWorker>()
            .setConstraints(networkConstraint)
            .build()

        val messageSyncRequest = OneTimeWorkRequestBuilder<MessageSyncWorker>()
            .setConstraints(networkConstraint)
            .build()

        val mediaSyncRequest = OneTimeWorkRequestBuilder<MediaSyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.UNMETERED)
                    .setRequiresBatteryNotLow(true)
                    .build()
            )
            .build()

        workManager.beginUniqueWork(
            "full_sync_chain",
            ExistingWorkPolicy.REPLACE,
            userSync,
        )
            .then(messageSyncRequest)
            .then(mediaSyncRequest)
            .enqueue()
    }

    fun scheduleImmediate(workManager: WorkManager) {
        val request = OneTimeWorkRequestBuilder<HiltSyncWorker>()
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
```

#### Common Mistakes

The most common mistake is using coroutines launched in a ViewModel or Activity scope for background sync instead of WorkManager. These coroutines are cancelled when the component is destroyed, meaning sync operations are interrupted when the user navigates away, rotates the screen, or the system kills the process for memory. WorkManager is the only mechanism that guarantees completion across all these scenarios.

Another frequent error is not making workers idempotent. If a worker inserts records without checking for duplicates and then fails partway through, the retry will insert the already-processed records again, creating duplicates. Always use upsert operations and track progress through sync position markers stored in the database.

Developers often forget to set `ExistingPeriodicWorkPolicy.KEEP` when enqueuing periodic work. Without this policy, every app launch enqueues a new periodic work request, and the system ends up running multiple overlapping sync workers. Using `KEEP` ensures that if a periodic work request with the same unique name already exists, the new request is ignored.

A fourth pitfall is not handling the `Result.retry()` case with a maximum attempt limit. Without checking `runAttemptCount`, a permanently failing sync (for example, due to a server-side bug returning 500 errors) will retry indefinitely, draining battery and wasting bandwidth. Always cap retries and transition to `Result.failure()` after a reasonable number of attempts, then surface the error to the user.

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

Modularization isn't something you do because a conference talk told you to. It's an organizational and architectural decision that should be driven by real pain — slow builds, merge conflicts, teams blocking each other, or code boundaries that keep getting violated. I've worked on Android codebases that ranged from a single module with 200 files dumped into a handful of packages to 40+ module projects where adding a new feature meant creating three modules before writing a single line of business logic. Both extremes taught me something. The single-module project was fast to navigate and simple to reason about — until four developers started stepping on each other's toes in every pull request. The heavily modularized project gave teams independence, but the build configuration overhead and navigation indirection made onboarding a nightmare. The sweet spot depends on your team size, codebase complexity, and growth trajectory. A 2-person team building an MVP shouldn't modularize beyond separating the app module from a core module. A 20-person team with 5 feature teams absolutely needs feature-level modularization.

When done well, modularization gives you parallel builds (Gradle compiles independent modules simultaneously), clear ownership (each team owns their modules), testability (modules can be tested in isolation), and encapsulation (internal classes can't leak across module boundaries with Kotlin's `internal` visibility). When done poorly, it gives you 30 Gradle files to maintain, circular dependency headaches, and build times that somehow got worse because every module depends on every other module. The `internal` visibility modifier is one of Kotlin's strongest modularization tools — it restricts access to the declaring module, so your repository implementation details, database helpers, and mappers can't be accessed by feature modules that have no business touching them.

The practical trigger for modularization is measurable. If your clean build takes more than three minutes, modularizing lets Gradle parallelize compilation across CPU cores. If more than 30% of your pull requests have merge conflicts, your code lacks clear boundaries. If a change to the networking layer accidentally breaks a UI test, your architecture isn't enforcing separation. These are the signals that warrant splitting a monolith, not a desire to follow what large companies do. Google, Square, and Netflix modularize because they have hundreds of engineers — your five-person startup has different constraints.

```kotlin
// A single-module project's build.gradle.kts — everything in one place
// This compiles the ENTIRE codebase on every change
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.example.monolith"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.monolith"
        minSdk = 26
        targetSdk = 34
    }
}

// Every dependency is in one flat list — no separation of concerns
dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.compose.ui:ui:1.6.0")
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("androidx.room:room-runtime:2.6.0")
    implementation("com.google.dagger:hilt-android:2.50")
    // 50+ more dependencies all in one file...
}
```

The first step toward modularization is extracting a `:core:network` or `:core:data` module from your monolith. This alone can cut incremental build times because changes to UI code no longer trigger recompilation of networking logic. Start by identifying the classes with the fewest inbound dependencies — utility classes, network interceptors, data mappers — and move them first. Gradle's dependency resolution will tell you immediately if you've created a circular reference, which is actually a gift: it forces you to untangle the spaghetti before it grows worse.

```kotlin
// Measuring build times to justify modularization
// Run this from the command line to get a build scan
// ./gradlew assembleDebug --scan --profile

// Programmatic build time tracking in settings.gradle.kts
gradle.addBuildListener(object : BuildListener {
    var buildStartTime = 0L

    override fun settingsEvaluated(settings: Settings) {}
    override fun projectsLoaded(gradle: Gradle) {}

    override fun projectsEvaluated(gradle: Gradle) {
        buildStartTime = System.currentTimeMillis()
    }

    override fun buildFinished(result: BuildResult) {
        val duration = System.currentTimeMillis() - buildStartTime
        println("Build finished in ${duration / 1000}s")
        if (duration > 180_000) {
            println("WARNING: Build exceeded 3 minutes — consider modularizing")
        }
    }
})
```

Once you decide to modularize, the migration path matters as much as the target architecture. Don't try to split a 500-file monolith into 20 modules in one sprint. Instead, follow an incremental approach: extract one module per sprint, validate build times and test isolation, and iterate. Each extraction should be a self-contained pull request that moves files, updates imports, and adjusts the Gradle dependency graph. The key is that every intermediate state must compile and pass tests — you never want a half-migrated codebase that blocks the entire team.

```kotlin
// Step-by-step migration: extracting :core:network from a monolith
// 1. Create the module directory and build.gradle.kts
// core/network/build.gradle.kts
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.example.core.network"
    compileSdk = 34
}

dependencies {
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.9.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
}
```

```kotlin
// 2. Move network classes and mark implementation details as internal
// :core:network — only the interface is public
interface ApiClient {
    suspend fun <T> get(endpoint: String, responseType: Class<T>): Result<T>
    suspend fun <T> post(endpoint: String, body: Any, responseType: Class<T>): Result<T>
}

// Internal — feature modules can't access this directly
internal class RetrofitApiClient(
    private val retrofit: Retrofit,
    private val errorMapper: ErrorMapper,
) : ApiClient {
    override suspend fun <T> get(
        endpoint: String,
        responseType: Class<T>,
    ): Result<T> = withContext(Dispatchers.IO) {
        runCatching {
            val response = retrofit.create(GenericApi::class.java).get(endpoint)
            if (response.isSuccessful) {
                response.body() as T
            } else {
                throw errorMapper.mapHttpError(response.code(), response.errorBody())
            }
        }
    }

    override suspend fun <T> post(
        endpoint: String,
        body: Any,
        responseType: Class<T>,
    ): Result<T> = withContext(Dispatchers.IO) {
        runCatching {
            val response = retrofit.create(GenericApi::class.java).post(endpoint, body)
            if (response.isSuccessful) {
                response.body() as T
            } else {
                throw errorMapper.mapHttpError(response.code(), response.errorBody())
            }
        }
    }
}
```

The key benefits are: faster incremental builds because Gradle only recompiles changed modules and their dependents, better testability because modules can be tested in isolation with fake dependencies, clear code ownership with team-aligned module boundaries, and enforced architectural boundaries through Gradle's dependency graph. The key costs are: more Gradle configuration to maintain, more boilerplate for inter-module communication, steeper onboarding curve for new developers, and potential over-fragmentation if taken too far. Weigh these tradeoffs honestly before committing to a modularization effort — the worst outcome is a half-modularized codebase where some code lives in modules and some doesn't, giving you the costs of both approaches and the benefits of neither.

#### Common Mistakes

The most frequent mistake is modularizing too early. A startup with two developers and 50 files doesn't need twelve modules — it needs shipping velocity. Creating modules adds ceremony: new `build.gradle.kts` files, inter-module dependency declarations, visibility modifiers to maintain, and navigation boilerplate. If your team is small enough that everyone understands the whole codebase, packages within a single module provide sufficient organization.

The second mistake is modularizing by technical layer instead of by feature. Splitting into `:data`, `:domain`, and `:presentation` modules feels architecturally clean but creates modules that change together for every feature — defeating the purpose. If adding a search screen requires touching three modules, you haven't gained independence; you've gained ceremony.

The third mistake is creating a "god module" — a `:common` or `:shared` module that everything depends on. This module becomes a build bottleneck (nothing compiles until it finishes) and a merge conflict magnet (every team adds code to it). If you catch yourself throwing unrelated utilities into a single shared module, stop and ask whether each utility belongs in a more specific `:core:*` module instead.

```kotlin
// Anti-pattern: god module that everything depends on
// :common/build.gradle.kts — DON'T do this
dependencies {
    // This module has become a dumping ground
    api("com.squareup.retrofit2:retrofit:2.9.0")       // networking
    api("androidx.room:room-runtime:2.6.0")             // database
    api("com.google.dagger:hilt-android:2.50")          // DI
    api("androidx.compose.ui:ui:1.6.0")                 // UI
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
    // Every module depends on :common, so every change triggers full rebuild
}

// Better: split into focused core modules
// :core:network depends only on Retrofit + OkHttp
// :core:database depends only on Room
// :core:ui depends only on Compose
// Each can build in parallel
```

The single-module project was fast to navigate and simple to reason about — until four developers started stepping on each other's toes in every pull request. Every change triggered full recompilation. The heavily modularized project gave teams independence, but the build configuration overhead made onboarding a nightmare.

The sweet spot depends on team size, codebase complexity, and growth trajectory. A 2-person team should not modularize beyond separating app from core. A 20-person team absolutely needs feature-level modularization.

The most reliable signal that you need to modularize is build time. When a one-line change triggers a 5-minute rebuild, modularization limits the recompilation blast radius. When merge conflicts are daily, modularization gives each team their own module.

```kotlin
data class ModularizationSignals(
    val averageBuildTimeSeconds: Int,
    val mergeConflictsPerWeek: Int,
    val developersOnProject: Int,
    val independentFeatureTeams: Int,
) {
    val recommendation: String
        get() = when {
            developersOnProject <= 3 -> "Single module with good packages is sufficient"
            averageBuildTimeSeconds > 300 || mergeConflictsPerWeek > 10 ->
                "Modularize now — build time and conflicts cause real pain"
            independentFeatureTeams >= 3 ->
                "Feature-based modules aligned to team boundaries"
            else -> "Monitor — modularize when pain increases"
        }
}
```

The key benefits when done well: faster incremental builds, better testability, clear code ownership, enforced architectural boundaries. The key costs: more Gradle configuration, more boilerplate for inter-module communication, steeper onboarding curve.

```kotlin
data class BuildTimeComparison(
    val scenario: String,
    val singleModuleSeconds: Int,
    val modularizedSeconds: Int,
    val speedup: String,
)

val buildTimeImprovements = listOf(
    BuildTimeComparison("Clean build", 180, 150, "1.2x"),
    BuildTimeComparison("Incremental (UI change)", 120, 15, "8x"),
    BuildTimeComparison("Incremental (core change)", 120, 90, "1.3x"),
)
```

**Key takeaway:** Modularize based on real pain, not theoretical benefits. Start with coarse-grained modules and refine only when specific problems (slow builds, merge conflicts, boundary violations) demand it. The right module count depends on team size and codebase complexity.

### Lesson 7.2: Module Types and Naming Conventions

Before writing any code, you need a clear taxonomy of what kinds of modules exist in your project and what goes where. I've seen teams invent module names ad hoc — `:utils`, `:shared`, `:common`, `:base` — and six months later nobody can tell you what the difference between `:common` and `:shared` is. A consistent naming convention prevents this entirely and serves as self-documenting architecture. The naming scheme should be so obvious that a new hire can look at a module path and immediately know what kind of code lives there, who owns it, and what's allowed to depend on it.

The module types that work best across projects are: `:app` (application entry point, DI wiring, navigation graph — depends on everything, nothing depends on it), `:feature:*` (independent user-facing features — `:feature:search`, `:feature:checkout`, `:feature:profile`), `:core:*` (shared infrastructure owned by a platform team — `:core:network`, `:core:database`, `:core:ui`, `:core:testing`), and `:lib:*` (pure Kotlin libraries with no Android dependencies — `:lib:analytics-api`, `:lib:formatting`). The `:lib:*` modules compile faster because they skip the Android Gradle plugin overhead entirely. Each category uses a different Gradle plugin — `:app` uses `com.android.application`, `:feature:*` and `:core:*` use `com.android.library`, and `:lib:*` uses `org.jetbrains.kotlin.jvm`. This distinction matters because Android library modules carry the cost of AIDL processing, resource merging, and manifest merging even if they don't use Android APIs.

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

When you adopt the API/impl split, the naming extends naturally. `:core:network:api` holds the interfaces and models. `:core:network:impl` holds the Retrofit implementation. Feature modules only depend on `:api` modules, never on `:impl`. The `:app` module is the only place that wires `:impl` to `:api` through DI bindings. This prevents feature modules from accidentally depending on concrete implementations and ensures the API surface is stable. The API/impl pattern also improves build times because the `:api` modules are small and rarely change — when you refactor the Retrofit implementation inside `:core:network:impl`, only the `:app` module recompiles, not every feature module.

```kotlin
// :core:network:api/build.gradle.kts — lightweight, pure interfaces
plugins {
    id("org.jetbrains.kotlin.jvm") // No Android plugin needed for pure interfaces
}

dependencies {
    // Only the models and coroutine types needed for the interface
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
}

// :core:network:impl/build.gradle.kts — heavy implementation details
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.example.core.network.impl"
    compileSdk = 34
}

dependencies {
    api(project(":core:network:api"))
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.9.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.google.dagger:hilt-android:2.50")
    ksp("com.google.dagger:hilt-compiler:2.50")
}
```

The `:lib:*` category deserves special attention. Any code that doesn't touch Android APIs — result wrappers, date formatting utilities, validation logic, analytics event definitions — should live in a `:lib:*` module using the pure Kotlin JVM plugin. These modules compile in a fraction of the time because they bypass the entire Android build pipeline. On a project I worked on, moving 15 utility classes from `:core:common` (an Android library module) to `:lib:common` (a pure Kotlin module) cut that module's build time from 8 seconds to under 2 seconds. Multiply that across dozens of dependent modules and the savings compound significantly.

```kotlin
// :lib:result/build.gradle.kts — pure Kotlin, no Android overhead
plugins {
    id("org.jetbrains.kotlin.jvm")
}

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.0")
    testImplementation("org.jetbrains.kotlin:kotlin-test:1.9.22")
    testImplementation("app.cash.turbine:turbine:1.0.0")
}

// :lib:result — a reusable Result wrapper used across all modules
// This compiles in <2 seconds vs ~8 seconds for an Android library module
```

```kotlin
// The actual code inside :lib:result
sealed interface AppResult<out T> {
    data class Success<T>(val data: T) : AppResult<T>
    data class Error(val exception: Throwable, val message: String? = null) : AppResult<Nothing>
    data object Loading : AppResult<Nothing>
}

// Extension to safely map results without unwrapping
inline fun <T, R> AppResult<T>.map(transform: (T) -> R): AppResult<R> = when (this) {
    is AppResult.Success -> AppResult.Success(transform(data))
    is AppResult.Error -> this
    is AppResult.Loading -> this
}

// Extension to convert suspending calls into AppResult
suspend fun <T> safeApiCall(block: suspend () -> T): AppResult<T> = try {
    AppResult.Success(block())
} catch (e: Exception) {
    AppResult.Error(e, e.message)
}
```

The directory structure on disk should mirror the Gradle module hierarchy. Gradle uses the colon-separated path (`:feature:search`) to map to the filesystem (`feature/search/`). Each module directory contains a `build.gradle.kts` file and a `src/` directory following the standard `main/kotlin/`, `main/res/`, `test/kotlin/` layout. Keeping this consistent means your file explorer, your Gradle configuration, and your mental model all align — there's no cognitive overhead translating between "where does this code live on disk?" and "what module is it in?"

```kotlin
// Enforcing module type rules with a custom Gradle check
// build-logic/convention/src/main/kotlin/ModuleTypeValidator.kt
fun Project.validateModuleType() {
    val modulePath = path // e.g., ":feature:search" or ":core:network:api"

    when {
        modulePath.startsWith(":feature:") -> {
            // Feature modules must use Android library plugin
            require(plugins.hasPlugin("com.android.library")) {
                "$modulePath is a feature module and must apply com.android.library"
            }
        }
        modulePath.startsWith(":lib:") -> {
            // Lib modules must NOT use Android plugin
            require(!plugins.hasPlugin("com.android.library")) {
                "$modulePath is a lib module and must use org.jetbrains.kotlin.jvm, not Android"
            }
        }
        modulePath.startsWith(":core:") && modulePath.endsWith(":api") -> {
            // API modules should prefer pure Kotlin when possible
            if (!plugins.hasPlugin("com.android.library")) {
                logger.lifecycle("$modulePath uses pure Kotlin — good for build performance")
            }
        }
    }
}
```

#### Common Mistakes

The most common naming mistake is using vague module names like `:utils`, `:helpers`, `:common`, or `:shared`. These names provide no architectural guidance and inevitably become dumping grounds for unrelated code. Instead, give every module a specific name that describes its responsibility: `:core:date-formatting` instead of `:utils`, `:core:image-loading` instead of `:helpers`. If you can't name a module specifically, the code it contains probably belongs in existing modules.

Another mistake is using the Android library plugin for modules that don't need Android APIs. Every module using `com.android.library` pays the cost of Android resource processing, manifest merging, and R class generation — even if the module contains only pure Kotlin data classes and interfaces. Check each `:core:*` module's imports: if nothing imports from `android.*` or `androidx.*`, switch it to `org.jetbrains.kotlin.jvm` for faster builds.

A subtler mistake is inconsistent depth in the module hierarchy. If you have `:feature:search` and `:feature:checkout` but also `:feature:payment:ui` and `:feature:payment:data`, the inconsistency creates confusion. Are payment UI and data separate modules because they're large, or because the team couldn't decide on a structure? Pick a convention — either all features are flat modules or all features have sub-modules — and stick with it across the project.

**Key takeaway:** Use a consistent module taxonomy — `:app`, `:feature:*`, `:core:*`, `:lib:*` — that serves as self-documenting architecture. The naming convention itself tells new developers where code belongs without reading any documentation.

### Lesson 7.3: Feature-Based vs Layer-Based Modules

The most common modularization mistake is splitting by architectural layer — a `:data` module, a `:domain` module, a `:presentation` module. This feels clean on a diagram, but it creates modules that change for every feature. Add a new screen? You touch all three modules. Every pull request crosses module boundaries, and you lose the main benefit of modularization: independent, parallel work on isolated features. I've seen teams spend weeks setting up this layered structure only to realize that their build times didn't improve because every feature change still triggered recompilation across the entire graph.

Feature-based modules group everything a feature needs — its UI, its repository, its use cases, its models — into one module. The `:feature:search` module contains search-related screens, data sources, and domain logic. The `:feature:checkout` module owns the checkout flow end to end. Two developers working on search and checkout never touch the same files or create merge conflicts. This structure works even better when module boundaries align with team boundaries — the payments team owns `:feature:payment`, the search team owns `:feature:search`. Each team can release, test, and iterate on their feature without coordinating with other teams.

The tradeoff is that feature modules can duplicate some code. Two features might define similar data classes or utility functions. The instinct is to extract everything shared into `:core`, but over-extracting creates a bloated core module that everything depends on — defeating the purpose of modularization. My rule of thumb: duplicate code across features until you see the same abstraction appear three times, then extract it. Premature extraction creates coupling; late extraction is a simple refactor.

```kotlin
// Layer-based modularization — ANTI-PATTERN
// Every feature touches every module, defeating parallel development

// :data module — ALL repositories for ALL features live here
class SearchRepository(private val api: SearchApi) {
    suspend fun search(query: String): List<SearchResult> = api.search(query)
}

class CheckoutRepository(private val api: CheckoutApi) {
    suspend fun placeOrder(cart: Cart): Order = api.placeOrder(cart)
}

class ProfileRepository(private val api: ProfileApi, private val dao: ProfileDao) {
    suspend fun getProfile(id: String): Profile = dao.getProfile(id) ?: api.fetchProfile(id)
}

// :domain module — ALL use cases for ALL features live here
class SearchUseCase(private val repo: SearchRepository) {
    suspend operator fun invoke(query: String): List<SearchResult> = repo.search(query)
}

class PlaceOrderUseCase(private val repo: CheckoutRepository) {
    suspend operator fun invoke(cart: Cart): Order = repo.placeOrder(cart)
}

// Problem: Adding a search filter requires changes to :data, :domain, AND :presentation
// Three modules touched, three reviews needed, three merge conflict opportunities
```

The feature-based approach inverts this structure. Each feature module contains its own layers internally — organized as packages rather than modules. The feature's data access, business logic, and UI all live in the same Gradle module but in separate packages. This gives you the architectural clarity of layered architecture with the build independence of feature isolation. The internal `internal` visibility modifier enforces boundaries within the module — a feature's repository implementation is marked `internal` so no other module can depend on it.

```kotlin
// Feature-based modularization — CORRECT APPROACH
// :feature:search contains everything search needs

// :feature:search/data/SearchRepository.kt
internal class SearchRepository(
    private val searchApi: SearchApi,
    private val searchDao: SearchDao,
) {
    suspend fun search(query: String): List<SearchResult> {
        val cached = searchDao.getCachedResults(query)
        if (cached.isNotEmpty()) return cached.map { it.toSearchResult() }

        val remote = searchApi.search(query)
        searchDao.cacheResults(remote.map { it.toEntity(query) })
        return remote
    }

    fun observeRecentSearches(): Flow<List<String>> = searchDao.observeRecentQueries()
}

// :feature:search/domain/SearchUseCase.kt
internal class SearchUseCase(
    private val repository: SearchRepository,
    private val analyticsTracker: AnalyticsTracker,
) {
    suspend operator fun invoke(query: String): AppResult<List<SearchResult>> {
        analyticsTracker.trackSearch(query)
        return safeApiCall { repository.search(query) }
    }
}

// :feature:search/ui/SearchViewModel.kt
@HiltViewModel
internal class SearchViewModel @Inject constructor(
    private val searchUseCase: SearchUseCase,
) : ViewModel() {
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    val results: StateFlow<AppResult<List<SearchResult>>> = _query
        .debounce(300)
        .filter { it.length >= 2 }
        .mapLatest { searchUseCase(it) }
        .stateIn(viewModelScope, SharingStarted.Lazily, AppResult.Loading)

    fun onQueryChanged(newQuery: String) { _query.value = newQuery }
}
```

The hybrid approach combines both strategies. Features are the primary module boundary, but shared infrastructure lives in layer-specific core modules. A `:core:domain` module defines shared interfaces like `Repository` base classes or common domain models (like `User` or `Money`). A `:core:data` module provides shared data utilities like a `NetworkBoundResource` helper. Feature modules depend on these thin core modules for shared contracts, but keep their feature-specific implementations private. This gives you the best of both worlds: features develop independently while sharing a common vocabulary.

```kotlin
// Hybrid approach: feature modules + thin core layers

// :core:domain — shared interfaces and models only (stays thin)
interface Repository<T> {
    fun observe(): Flow<T>
    suspend fun refresh()
}

data class Money(val amount: Long, val currency: Currency) {
    enum class Currency { USD, EUR, GBP, INR }

    operator fun plus(other: Money): Money {
        require(currency == other.currency) { "Cannot add different currencies" }
        return Money(amount + other.amount, currency)
    }
}

// :feature:checkout uses the shared Money type
// but keeps its own repository implementation internal
internal class CheckoutRepository(
    private val checkoutApi: CheckoutApi,
    private val cartDao: CartDao,
) : Repository<Cart> {
    override fun observe(): Flow<Cart> = cartDao.observeCart().map { it.toCart() }

    override suspend fun refresh() {
        val remote = checkoutApi.getCart()
        cartDao.replaceCart(remote.toEntity())
    }

    suspend fun applyCoupon(code: String): Money {
        val discount = checkoutApi.validateCoupon(code)
        return Money(discount.amount, Money.Currency.valueOf(discount.currency))
    }
}
```

When deciding between approaches, consider the "change frequency" heuristic. If most of your pull requests touch a single feature (adding a field, fixing a bug, updating a screen), feature-based modules are the clear winner. If most of your changes are cross-cutting (updating the network layer, changing the caching strategy, migrating to a new database version), layer-based modules might make more sense. In practice, the vast majority of Android development work is feature-centric — building new screens, iterating on existing flows, fixing feature-specific bugs — so feature-based modularization wins for most teams.

```kotlin
// Build configuration for a feature module
// :feature:search/build.gradle.kts
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.example.feature.search"
    compileSdk = 34

    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "com.example.core.testing.HiltTestRunner"
    }

    buildFeatures { compose = true }
    composeOptions { kotlinCompilerExtensionVersion = "1.5.8" }
}

dependencies {
    // Core dependencies — thin shared contracts
    implementation(project(":core:network:api"))
    implementation(project(":core:database"))
    implementation(project(":core:ui"))
    implementation(project(":core:domain"))
    implementation(project(":core:navigation"))

    // Feature-specific dependencies
    implementation("androidx.paging:paging-compose:3.2.1")

    // DI
    implementation("com.google.dagger:hilt-android:2.50")
    ksp("com.google.dagger:hilt-compiler:2.50")

    // Testing — uses shared test infrastructure
    testImplementation(project(":core:testing"))
    androidTestImplementation(project(":core:testing"))
}
```

#### Common Mistakes

The biggest mistake is dogmatically choosing one approach and applying it everywhere. Some parts of your codebase are better served by feature modules (user-facing flows) while others work better as shared layers (the design system, networking, analytics). The goal is pragmatic separation, not architectural purity. Use feature modules for product features and layer modules for shared infrastructure.

Another common mistake is making feature modules too granular. Creating separate modules for `:feature:search:ui`, `:feature:search:data`, and `:feature:search:domain` brings back the exact problem you were trying to avoid — every search change touches three modules. Keep each feature as a single module with internal package separation. Only split a feature into sub-modules if it's genuinely large enough that multiple teams work on different parts of it simultaneously.

Teams also frequently forget to mark feature-internal classes as `internal`. Without this visibility modifier, other modules can accidentally depend on a feature's repository or ViewModel, creating invisible coupling that breaks the independence you designed for. Make every class in a feature module `internal` by default, and only make things public when they're explicitly part of the module's contract — typically just the navigation registration function and shared models.

Feature-based modules group everything a feature needs into one module. Two developers working on search and checkout never touch the same files. This structure works even better when module boundaries align with team boundaries.

The hybrid approach works best. Feature modules own their screens, ViewModels, and feature-specific repositories. Core modules provide shared infrastructure. The feature module internally follows clean architecture layers, but these layers are internal — other modules cannot depend on them.

```kotlin
// Internal feature module structure
// :feature:search/
//   ui/SearchScreen.kt, SearchViewModel.kt     (internal)
//   data/SearchRepository.kt                    (internal)
//   domain/SearchUseCase.kt                     (internal)
//   navigation/SearchNavigation.kt              (public API)
```

The tradeoff is potential code duplication. Two features might define similar data classes. My rule: duplicate until you see the same abstraction three times, then extract. Premature extraction creates coupling.

```kotlin
data class ExtractionDecision(
    val code: String,
    val duplicationCount: Int,
    val recommendation: String,
)

val decisions = listOf(
    ExtractionDecision("DateFormatter", 2, "Keep duplicated — may diverge"),
    ExtractionDecision("ErrorBanner", 3, "Extract to :core:ui — stable and shared"),
    ExtractionDecision("RetryPolicy", 4, "Extract to :core:network"),
    ExtractionDecision("CartCalculator", 1, "Keep in :feature:checkout — single owner"),
)
```

**Key takeaway:** Prefer feature-based modules over layer-based modules. Feature modules enable parallel development, reduce merge conflicts, and align naturally with team boundaries. Tolerate duplication between features rather than creating a bloated shared core.

### Lesson 7.4: Dependency Rules and Inter-Module Communication

Circular dependencies between modules are the modularization equivalent of spaghetti code. Gradle won't compile them. But the real problem starts earlier, when the dependency graph is technically acyclic but practically tangled through transitive dependencies. If `:feature:search` depends on `:core:network` which depends on `:core:logging` which depends on `:core:config` which depends on `:core:network` — that's a cycle Gradle catches. But if every feature module depends on every core module, you have a technically valid graph that still defeats parallel compilation and creates a brittle build. The fix is strict dependency rules enforced by convention and tooling.

The rules are: `:app` depends on everything but nothing depends on `:app`. Feature modules depend on `:core:*` modules but never on other feature modules. `:core:domain` defines interfaces that `:core:data` implements — the domain never depends on data. `:core:*` modules never depend on `:feature:*` modules. Dependencies always flow inward — from features to core, never the reverse. These rules sound simple, but enforcing them requires discipline because the path of least resistance is always to add a direct dependency between two modules that need to communicate.

When features need to communicate (checkout needs the user's shipping address from the profile feature), use dependency inversion through a shared contracts module. Define an interface in `:core:contracts`, implement it in `:feature:profile`, and wire it in `:app` through DI. The checkout module never knows about profiles — it asks for a `ShippingAddressProvider` and gets one. This pattern keeps the dependency graph clean while enabling rich cross-feature behavior.

```kotlin
// Defined in :core:contracts — shared interface both features can see
interface ShippingAddressProvider {
    suspend fun getDefaultAddress(userId: String): ShippingAddress?
    fun observeAddresses(userId: String): Flow<List<ShippingAddress>>
}

// Also in :core:contracts — the data model
data class ShippingAddress(
    val id: String,
    val street: String,
    val city: String,
    val state: String,
    val zipCode: String,
    val country: String,
    val isDefault: Boolean,
)

// Implemented in :feature:profile — the profile team owns this
internal class ProfileShippingAddressProvider(
    private val profileRepository: ProfileRepository,
) : ShippingAddressProvider {
    override suspend fun getDefaultAddress(userId: String): ShippingAddress? {
        return profileRepository.getProfile(userId)
            ?.defaultAddress
            ?.toShippingAddress()
    }

    override fun observeAddresses(userId: String): Flow<List<ShippingAddress>> {
        return profileRepository.observeAddresses(userId)
            .map { entities -> entities.map { it.toShippingAddress() } }
    }
}
```

The `api` versus `implementation` distinction in Gradle is the enforcement mechanism for these rules. When `:feature:search` declares `implementation(project(":core:network:api"))`, the search module can use the network API's types, but any module that depends on `:feature:search` cannot see those network types. This prevents transitive dependency leaks. In contrast, `api(project(":core:network:api"))` would expose the network types to everything that depends on search — creating an invisible coupling chain. Default to `implementation` for every dependency and only switch to `api` when a dependency's types appear in your module's public function signatures or class hierarchies.

```kotlin
// :feature:checkout/build.gradle.kts — strict dependency declarations
dependencies {
    // implementation: checkout uses these internally, doesn't expose their types
    implementation(project(":core:network:api"))
    implementation(project(":core:database"))
    implementation(project(":core:ui"))
    implementation(project(":core:navigation"))

    // implementation: cross-feature communication via contracts
    implementation(project(":core:contracts"))

    // api: checkout exposes CheckoutResult which contains Money from :core:domain
    // Any module calling checkout's public API needs to see Money
    api(project(":core:domain"))

    // DI wiring
    implementation("com.google.dagger:hilt-android:2.50")
    ksp("com.google.dagger:hilt-compiler:2.50")

    // Testing
    testImplementation(project(":core:testing"))
}
```

The `:app` module is the composition root — the only place where implementations are wired to their interfaces. Every DI binding that connects a `:feature:*` implementation to a `:core:contracts` interface lives in `:app`. This means `:app` has visibility into all modules, but no module has visibility into `:app`. The `:app` module's DI configuration is the single source of truth for "what concrete class provides what interface." This centralization makes it trivial to swap implementations for testing (provide a fake `ShippingAddressProvider` in integration tests) or for different build flavors (a mock implementation for debug builds).

```kotlin
// Wired in :app's DI module — the composition root
@Module
@InstallIn(SingletonComponent::class)
abstract class ContractBindingsModule {
    @Binds
    abstract fun bindShippingAddressProvider(
        impl: ProfileShippingAddressProvider,
    ): ShippingAddressProvider

    @Binds
    abstract fun bindAuthProvider(
        impl: AuthFeatureAuthProvider,
    ): AuthProvider

    @Binds
    abstract fun bindCartProvider(
        impl: CheckoutCartProvider,
    ): CartProvider
}

// For testing, swap with fakes in a test-specific module
@Module
@InstallIn(SingletonComponent::class)
@TestInstallIn(replaces = [ContractBindingsModule::class])
abstract class FakeContractBindingsModule {
    @Binds
    abstract fun bindShippingAddressProvider(
        impl: FakeShippingAddressProvider,
    ): ShippingAddressProvider
}
```

To enforce dependency rules automatically rather than relying on code review, you can write a Gradle task that analyzes the module graph and fails the build if any rule is violated. This check runs during CI and catches violations before they're merged. The cost of writing this check once pays for itself every time a developer accidentally adds a feature-to-feature dependency in a large pull request that reviewers might miss.

```kotlin
// build-logic/convention/src/main/kotlin/DependencyRulePlugin.kt
// Custom Gradle plugin that enforces module dependency rules
abstract class DependencyRulePlugin : Plugin<Project> {
    override fun apply(project: Project) {
        project.afterEvaluate {
            val modulePath = project.path
            val dependencies = project.configurations
                .filter { it.name == "implementation" || it.name == "api" }
                .flatMap { it.dependencies }
                .filterIsInstance<ProjectDependency>()
                .map { it.dependencyProject.path }

            dependencies.forEach { depPath ->
                // Rule 1: Features cannot depend on other features
                if (modulePath.startsWith(":feature:") && depPath.startsWith(":feature:")) {
                    throw GradleException(
                        "DEPENDENCY VIOLATION: $modulePath depends on $depPath. " +
                            "Features must not depend on other features. " +
                            "Use :core:contracts for cross-feature communication."
                    )
                }

                // Rule 2: Core modules cannot depend on feature modules
                if (modulePath.startsWith(":core:") && depPath.startsWith(":feature:")) {
                    throw GradleException(
                        "DEPENDENCY VIOLATION: $modulePath depends on $depPath. " +
                            "Core modules must never depend on feature modules."
                    )
                }

                // Rule 3: Nothing depends on :app
                if (depPath == ":app") {
                    throw GradleException(
                        "DEPENDENCY VIOLATION: $modulePath depends on :app. " +
                            "The :app module is a leaf — nothing should depend on it."
                    )
                }
            }
        }
    }
}
```

For event-based communication between features that need loose coupling beyond simple data access, use a shared event bus or mediator pattern defined in `:core:contracts`. One feature publishes events, another subscribes — neither knows about the other. For example, the checkout feature publishes an `OrderPlaced` event, and the profile feature listens for it to update the user's order history. The event types are defined in `:core:contracts`, keeping both features decoupled while enabling reactive communication.

```kotlin
// :core:contracts — shared event infrastructure
interface AppEvent

data class OrderPlacedEvent(
    val orderId: String,
    val userId: String,
    val totalAmount: Money,
) : AppEvent

data class ProfileUpdatedEvent(
    val userId: String,
    val updatedFields: Set<String>,
) : AppEvent

// Event bus interface in :core:contracts
interface EventBus {
    suspend fun publish(event: AppEvent)
    fun <T : AppEvent> subscribe(eventType: KClass<T>): Flow<T>
}

// Implementation in :core:events (an impl module)
internal class SharedFlowEventBus : EventBus {
    private val events = MutableSharedFlow<AppEvent>(
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    override suspend fun publish(event: AppEvent) {
        events.emit(event)
    }

    override fun <T : AppEvent> subscribe(eventType: KClass<T>): Flow<T> {
        return events.filterIsInstance(eventType)
    }
}
```

#### Common Mistakes

The most dangerous mistake is using `api` when you should use `implementation`. Every `api` dependency creates a transitive dependency chain — if `:feature:search` declares `api(project(":core:network:api"))` and `:app` depends on `:feature:search`, then `:app` transitively gets access to `:core:network:api` types through the search module. Worse, when `:core:network:api` changes, both `:feature:search` and `:app` recompile. In a large project, one misplaced `api` declaration can cascade into rebuilding half the project.

Another mistake is putting implementation details in contract interfaces. The `:core:contracts` module should define stable, minimal interfaces. If the `ShippingAddressProvider` interface returns a Room `Entity` class, you've just leaked a database dependency into every module that uses the contract. Contract types should be plain Kotlin data classes with no framework dependencies — this keeps the contracts module fast to compile and free from external version conflicts.

Teams also commonly create "back-door" dependencies by sharing module-internal types through constructor parameters wired in DI. If `:feature:checkout` injects a class from `:feature:profile` through Hilt because both are visible in `:app`, you've bypassed the dependency rules at the Gradle level but created a logical dependency that makes checkout and profile inseparable. Always route cross-feature communication through explicit contract interfaces.

**Key takeaway:** Enforce strict dependency rules: features depend on core, never on each other. Use dependency inversion through shared contract interfaces for cross-feature communication. The `:app` module is the only place that wires implementations to interfaces.

### Lesson 7.5: Feature Module Structure and Navigation

Each feature module should be self-contained — it owns its screens, ViewModels, navigation registration, and feature-specific DI bindings. The only thing it exposes to the outside world is a `NavGraphBuilder` extension function that registers its navigation destinations. This minimal public API means you can refactor everything inside a feature module without touching any other module. The internal structure of a feature module follows a consistent package layout: `data/` for repositories and data sources, `domain/` for use cases and business logic, `ui/` for screens, components, and ViewModels, and `di/` for Hilt modules that wire the feature's dependencies.

Navigation between feature modules uses route-based navigation. The `:core:navigation` module defines route constants or a sealed class of destinations. Each feature module registers itself against its routes using `NavGraphBuilder` extensions. The `:app` module composes the full navigation graph by calling each feature's registration function. This approach avoids compile-time dependencies between features while maintaining type-safe navigation. The critical design insight is that navigation callbacks (like `onNavigateToProfile`) are lambda parameters passed from `:app` into each feature — the feature module never references another feature's route directly.

```kotlin
// :core:navigation — shared route definitions as a sealed hierarchy
sealed class AppRoute(val route: String) {
    data object Home : AppRoute("home")
    data object Search : AppRoute("search")
    data object Checkout : AppRoute("checkout")

    data class Profile(val userId: String) : AppRoute("profile/$userId") {
        companion object {
            const val ROUTE_PATTERN = "profile/{userId}"
            const val ARG_USER_ID = "userId"
        }
    }

    data class OrderDetail(val orderId: String) : AppRoute("order/$orderId") {
        companion object {
            const val ROUTE_PATTERN = "order/{orderId}"
            const val ARG_ORDER_ID = "orderId"
        }
    }
}

// Navigation helper for type-safe argument extraction
fun NavBackStackEntry.requireStringArg(key: String): String {
    return requireNotNull(arguments?.getString(key)) {
        "Required navigation argument '$key' is missing"
    }
}
```

The feature module's navigation registration function is the sole public API surface. Everything else — the ViewModel, the repository, the screen composable, the DI module — is marked `internal`. This function takes lambda callbacks for navigation events instead of a `NavController` reference, which keeps the feature completely unaware of where it sits in the navigation graph. The feature just says "the user tapped on a profile" and the caller decides what to do with that event.

```kotlin
// :feature:profile — registers its own navigation
// This is the ONLY public function in the entire module
fun NavGraphBuilder.profileNavigation(
    onNavigateBack: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToOrderHistory: (userId: String) -> Unit,
) {
    composable(
        route = AppRoute.Profile.ROUTE_PATTERN,
        arguments = listOf(
            navArgument(AppRoute.Profile.ARG_USER_ID) {
                type = NavType.StringType
            },
        ),
    ) { backStackEntry ->
        val userId = backStackEntry.requireStringArg(AppRoute.Profile.ARG_USER_ID)
        val viewModel: ProfileViewModel = hiltViewModel()

        LaunchedEffect(userId) {
            viewModel.loadProfile(userId)
        }

        ProfileScreen(
            viewModel = viewModel,
            onNavigateBack = onNavigateBack,
            onNavigateToSettings = onNavigateToSettings,
            onNavigateToOrderHistory = { onNavigateToOrderHistory(userId) },
        )
    }
}

// Everything below is internal — invisible to other modules
@HiltViewModel
internal class ProfileViewModel @Inject constructor(
    private val getProfileUseCase: GetProfileUseCase,
    private val savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val _uiState = MutableStateFlow<ProfileUiState>(ProfileUiState.Loading)
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    fun loadProfile(userId: String) {
        viewModelScope.launch {
            _uiState.value = ProfileUiState.Loading
            getProfileUseCase(userId)
                .onSuccess { _uiState.value = ProfileUiState.Success(it) }
                .onFailure { _uiState.value = ProfileUiState.Error(it.message) }
        }
    }
}
```

The `:app` module composes the full navigation graph by calling each feature's registration function and providing the navigation callbacks. This is where the `NavController` lives and where inter-feature navigation is orchestrated. The `:app` module is the only place that knows about all features simultaneously — it connects them through callbacks without any feature knowing about any other feature. This pattern scales cleanly to 20+ features because adding a new feature only requires adding one more registration call in the app's nav graph.

```kotlin
// :app — composes the full navigation graph
@Composable
fun AppNavGraph(navController: NavHostController) {
    NavHost(
        navController = navController,
        startDestination = AppRoute.Home.route,
    ) {
        // Each feature registers itself with navigation callbacks
        homeNavigation(
            onNavigateToProfile = { userId ->
                navController.navigate(AppRoute.Profile(userId).route)
            },
            onNavigateToSearch = {
                navController.navigate(AppRoute.Search.route)
            },
        )

        profileNavigation(
            onNavigateBack = { navController.popBackStack() },
            onNavigateToSettings = {
                navController.navigate("settings")
            },
            onNavigateToOrderHistory = { userId ->
                navController.navigate("orders/$userId")
            },
        )

        searchNavigation(
            onNavigateToResult = { resultId ->
                navController.navigate("result/$resultId")
            },
            onNavigateBack = { navController.popBackStack() },
        )

        checkoutNavigation(
            onNavigateBack = { navController.popBackStack() },
            onOrderComplete = { orderId ->
                navController.navigate(AppRoute.OrderDetail(orderId).route) {
                    popUpTo(AppRoute.Home.route)
                }
            },
        )
    }
}
```

Feature-specific DI configuration lives inside the feature module using Hilt's `@Module` and `@InstallIn` annotations. Because Hilt processes modules across the entire build, a `@Module` defined in `:feature:search` is automatically discovered and installed by Hilt even though the `:app` module doesn't explicitly reference it. This means each feature fully configures its own dependency graph — the platform team doesn't need to update a central DI configuration every time a feature team adds a new dependency.

```kotlin
// :feature:search/di/SearchModule.kt — feature-specific DI
@Module
@InstallIn(SingletonComponent::class)
internal object SearchModule {

    @Provides
    @Singleton
    fun provideSearchApi(retrofit: Retrofit): SearchApi {
        return retrofit.create(SearchApi::class.java)
    }

    @Provides
    @Singleton
    fun provideSearchDao(database: AppDatabase): SearchDao {
        return database.searchDao()
    }

    @Provides
    @Singleton
    fun provideSearchRepository(
        searchApi: SearchApi,
        searchDao: SearchDao,
    ): SearchRepository {
        return SearchRepository(searchApi, searchDao)
    }
}

// :feature:search/di/SearchViewModelModule.kt
@Module
@InstallIn(ViewModelComponent::class)
internal object SearchViewModelModule {

    @Provides
    fun provideSearchUseCase(
        repository: SearchRepository,
        analyticsTracker: AnalyticsTracker,
    ): SearchUseCase {
        return SearchUseCase(repository, analyticsTracker)
    }
}
```

For features with multiple screens (like a checkout flow with cart, shipping, payment, and confirmation steps), the feature module registers a nested navigation graph rather than individual composables. This encapsulates the multi-step flow inside the feature and lets the feature manage its own back stack behavior. The `:app` module treats the entire checkout flow as a single navigation destination — it doesn't know or care how many screens are inside.

```kotlin
// :feature:checkout — multi-screen flow as a nested nav graph
fun NavGraphBuilder.checkoutNavigation(
    onNavigateBack: () -> Unit,
    onOrderComplete: (orderId: String) -> Unit,
) {
    navigation(
        startDestination = "checkout/cart",
        route = AppRoute.Checkout.route,
    ) {
        composable("checkout/cart") {
            val viewModel: CartViewModel = hiltViewModel()
            CartScreen(
                viewModel = viewModel,
                onNavigateBack = onNavigateBack,
                onProceedToShipping = {
                    it.navigate("checkout/shipping")
                },
            )
        }

        composable("checkout/shipping") {
            val viewModel: ShippingViewModel = hiltViewModel()
            ShippingScreen(
                viewModel = viewModel,
                onNavigateBack = { it.popBackStack() },
                onProceedToPayment = {
                    it.navigate("checkout/payment")
                },
            )
        }

        composable("checkout/payment") {
            val viewModel: PaymentViewModel = hiltViewModel()
            PaymentScreen(
                viewModel = viewModel,
                onNavigateBack = { it.popBackStack() },
                onOrderPlaced = { orderId -> onOrderComplete(orderId) },
            )
        }
    }
}
```

Deep links add another dimension to feature module navigation. Each feature module can declare which deep link patterns it handles, and the navigation framework routes incoming intents to the correct feature without any central routing logic. The deep link URI pattern is defined alongside the route in the feature's navigation registration, keeping the deep link configuration co-located with the screen that handles it.

```kotlin
// :feature:profile — deep link support
fun NavGraphBuilder.profileNavigation(
    onNavigateBack: () -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToOrderHistory: (userId: String) -> Unit,
) {
    composable(
        route = AppRoute.Profile.ROUTE_PATTERN,
        arguments = listOf(
            navArgument(AppRoute.Profile.ARG_USER_ID) {
                type = NavType.StringType
            },
        ),
        deepLinks = listOf(
            navDeepLink {
                uriPattern = "https://example.com/user/{userId}"
            },
            navDeepLink {
                uriPattern = "example://profile/{userId}"
            },
        ),
    ) { backStackEntry ->
        val userId = backStackEntry.requireStringArg(AppRoute.Profile.ARG_USER_ID)
        val viewModel: ProfileViewModel = hiltViewModel()

        LaunchedEffect(userId) { viewModel.loadProfile(userId) }

        ProfileScreen(
            viewModel = viewModel,
            onNavigateBack = onNavigateBack,
            onNavigateToSettings = onNavigateToSettings,
            onNavigateToOrderHistory = { onNavigateToOrderHistory(userId) },
        )
    }
}
```

#### Common Mistakes

The most common navigation mistake is passing a `NavController` directly into feature modules. When a feature module receives a `NavController`, it gains the ability to navigate anywhere in the app — to routes owned by other features, to routes that might not exist, or even to pop the entire back stack. This defeats encapsulation. Always pass lambda callbacks (`onNavigateToProfile: (String) -> Unit`) instead of the controller itself. The feature declares what navigation events it emits; the caller decides how to handle them.

Another mistake is defining feature routes as string literals scattered across the codebase. If the profile route is `"profile/{userId}"` in three different files and you change it in one, the other two silently break at runtime. Centralize route definitions in `:core:navigation` as constants or sealed classes. Every feature references the same source of truth, and refactoring a route is a single-location change.

Teams also frequently forget to scope their Hilt modules correctly. Installing every provider in `SingletonComponent` means the objects live for the entire app lifecycle, even if the feature they belong to is never opened. Use `ViewModelComponent` for use cases and repositories that should be scoped to a screen's lifecycle, and `ActivityRetainedComponent` for data that survives configuration changes but doesn't need to outlive the activity. Only use `SingletonComponent` for truly app-wide singletons like the Retrofit instance or the Room database.

**Key takeaway:** Features expose only a `NavGraphBuilder` extension function — their entire public API is "how to navigate to me." This encapsulation lets you add, remove, or refactor features without touching other modules.

### Lesson 7.6: Build Performance and Module Optimization

One of the primary motivations for modularization is faster builds, but poorly structured modules can actually make builds slower. The key is understanding Gradle's build parallelism: independent modules compile simultaneously on separate CPU cores, but modules with dependencies compile sequentially because a module can't start compiling until all its dependencies are built. A module graph where everything depends on everything is a linear build, not a parallel one. The ideal module graph looks like a wide, shallow tree — many leaf modules that depend on a small number of core modules, maximizing the work Gradle can do in parallel.

To maximize parallelism, keep the dependency graph shallow and wide. Feature modules should depend on a small number of core modules, not on each other. Core modules should be fine-grained — `:core:network`, `:core:database`, `:core:ui` — rather than a single monolithic `:core` that everything depends on. A monolithic core module is a serialization point: every module waits for it to build before starting. Splitting it into independent core modules lets them build in parallel. You can visualize your module graph using Gradle's `dependencies` task or third-party tools like module-graph-assert to identify bottleneck modules that block the most downstream work.

Use `api` vs `implementation` dependencies correctly. `implementation` means the dependency is an internal detail — downstream modules can't see it and aren't recompiled when it changes. `api` means the dependency is part of the module's public API — downstream modules can see it and are recompiled when it changes. Using `api` when you should use `implementation` creates unnecessary recompilation cascades. Default to `implementation` and only use `api` when a dependency's types appear in your module's public interface. On a project with 30 modules, fixing misused `api` declarations cut incremental build times by 40% because changes no longer cascaded through the entire graph.

```kotlin
// :feature:search/build.gradle.kts — optimized dependency declarations
dependencies {
    // implementation — internal details, won't trigger recompilation of dependents
    implementation(project(":core:network:api"))
    implementation(project(":core:database"))
    implementation(project(":core:ui"))
    implementation(project(":core:navigation"))

    // api — ONLY when search exposes types from this module in its public functions
    // e.g., profileNavigation() returns a type from :core:domain
    // api(project(":core:domain"))  // Avoid unless absolutely necessary

    // Test dependencies — never use api for test deps
    testImplementation(project(":core:testing"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.0")
    testImplementation("app.cash.turbine:turbine:1.0.0")
}
```

Convention plugins are the most impactful build performance optimization for multi-module projects. Instead of duplicating the same `build.gradle.kts` configuration across 30 modules — the same `compileSdk`, `minSdk`, Compose compiler version, Kotlin compiler options, and common dependencies — you define it once in a convention plugin and apply it everywhere. This reduces Gradle configuration time (less script compilation), eliminates version drift across modules, and makes build changes a single-line edit instead of a 30-file pull request.

```kotlin
// build-logic/convention/src/main/kotlin/AndroidFeatureConventionPlugin.kt
// Applied to every feature module: id("convention.android.feature")
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) {
        with(target) {
            with(pluginManager) {
                apply("com.android.library")
                apply("org.jetbrains.kotlin.android")
                apply("com.google.dagger.hilt.android")
                apply("com.google.devtools.ksp")
            }

            extensions.configure<LibraryExtension> {
                compileSdk = 34
                defaultConfig.minSdk = 26
                defaultConfig.testInstrumentationRunner =
                    "com.example.core.testing.HiltTestRunner"

                buildFeatures.compose = true
                composeOptions.kotlinCompilerExtensionVersion = "1.5.8"

                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
            }

            dependencies {
                // Every feature module gets these automatically
                add("implementation", project(":core:ui"))
                add("implementation", project(":core:navigation"))
                add("implementation", project(":core:domain"))
                add("implementation", libs.findLibrary("hilt.android").get())
                add("ksp", libs.findLibrary("hilt.compiler").get())
                add("testImplementation", project(":core:testing"))
            }
        }
    }
}
```

```kotlin
// With convention plugins, a feature module's build.gradle.kts becomes minimal
// :feature:search/build.gradle.kts — just 10 lines instead of 50
plugins {
    id("convention.android.feature")
}

android {
    namespace = "com.example.feature.search"
}

dependencies {
    // Only feature-specific dependencies that aren't in the convention plugin
    implementation(project(":core:network:api"))
    implementation(libs.paging.compose)
}
```

Gradle build cache and configuration cache are critical for CI performance. The build cache stores task outputs (compiled classes, generated resources) and reuses them when inputs haven't changed — across local builds and even across CI machines with a remote cache. The configuration cache serializes the task graph after configuration, skipping the expensive configuration phase on subsequent builds. Enable both in `gradle.properties` and monitor cache hit rates in your build scans. A well-modularized project with proper `implementation` dependencies achieves 80-95% cache hit rates on incremental builds.

```kotlin
// gradle.properties — build performance settings
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configuration-cache=true
org.gradle.configureondemand=true

// Increase daemon memory for large projects
org.gradle.jvmargs=-Xmx4g -XX:+HeapDumpOnOutOfMemoryError

// Enable file-system watching for faster up-to-date checks
org.gradle.vfs.watch=true

// Kotlin-specific optimizations
kotlin.incremental=true
kotlin.caching.enabled=true
```

```kotlin
// Analyzing module build times with a custom listener
// settings.gradle.kts — add this to identify slow modules
gradle.addBuildListener(object : BuildListener {
    private val taskTimes = mutableMapOf<String, Long>()
    private var configStart = 0L

    override fun settingsEvaluated(settings: Settings) {
        configStart = System.currentTimeMillis()
    }

    override fun projectsLoaded(gradle: Gradle) {}

    override fun projectsEvaluated(gradle: Gradle) {
        val configTime = System.currentTimeMillis() - configStart
        println("Configuration phase: ${configTime}ms")

        gradle.taskGraph.addTaskExecutionListener(object : TaskExecutionListener {
            override fun beforeExecute(task: Task) {
                taskTimes[task.path] = System.currentTimeMillis()
            }

            override fun afterExecute(task: Task, state: TaskState) {
                val start = taskTimes[task.path] ?: return
                val duration = System.currentTimeMillis() - start
                if (duration > 5000) {
                    println("SLOW TASK: ${task.path} took ${duration / 1000}s")
                }
            }
        })
    }

    override fun buildFinished(result: BuildResult) {
        println("Build ${if (result.failure == null) "succeeded" else "FAILED"}")
    }
})
```

Module graph analysis helps you identify structural problems before they impact build times. The critical metric is the "critical path" — the longest chain of dependent modules in your graph. If your critical path is `:lib:result` → `:core:domain` → `:core:network:api` → `:core:network:impl` → `:feature:search` → `:app`, that's six sequential compilation steps. Any module on the critical path blocks everything downstream. Shorten the critical path by reducing dependencies between core modules and ensuring feature modules don't depend on `:impl` modules (they should only depend on `:api` modules, which are small and fast to compile).

```kotlin
// Gradle task to analyze module dependencies and find the critical path
// build-logic/convention/src/main/kotlin/ModuleGraphAnalyzer.kt
abstract class ModuleGraphAnalyzerTask : DefaultTask() {
    @TaskAction
    fun analyze() {
        val rootProject = project.rootProject
        val moduleGraph = mutableMapOf<String, Set<String>>()

        rootProject.subprojects.forEach { subproject ->
            val deps = subproject.configurations
                .filter { it.name in setOf("implementation", "api") }
                .flatMap { it.dependencies }
                .filterIsInstance<ProjectDependency>()
                .map { it.dependencyProject.path }
                .toSet()
            moduleGraph[subproject.path] = deps
        }

        // Find critical path (longest dependency chain)
        val depths = mutableMapOf<String, Int>()
        fun depth(module: String): Int {
            depths[module]?.let { return it }
            val deps = moduleGraph[module] ?: emptySet()
            val d = if (deps.isEmpty()) 0 else deps.maxOf { depth(it) } + 1
            depths[module] = d
            return d
        }

        moduleGraph.keys.forEach { depth(it) }
        val sorted = depths.entries.sortedByDescending { it.value }

        println("\n=== Module Dependency Depth ===")
        sorted.forEach { (module, d) ->
            val bar = "█".repeat(d)
            println("$bar $module (depth: $d)")
        }

        val criticalPath = sorted.first()
        println("\nCritical path depth: ${criticalPath.value}")
        println("Bottleneck module: ${criticalPath.key}")
        println("Total modules: ${moduleGraph.size}")
    }
}
```

#### Common Mistakes

The most impactful performance mistake is creating a monolithic `:core` module instead of fine-grained core modules. If `:core` contains networking, database, UI components, and analytics, every feature depends on all of it. Any change to a UI component recompiles the entire core, which triggers recompilation of every feature module. Split `:core` into `:core:network`, `:core:database`, `:core:ui`, and `:core:analytics` so each can build and cache independently. This single change often cuts incremental build times in half.

Another common mistake is not enabling Gradle parallelism and caching. Many teams run `org.gradle.parallel=false` (the old default) and wonder why their 20-module project builds sequentially. Check your `gradle.properties` — `parallel`, `caching`, and `configuration-cache` should all be `true`. Also verify that your CI pipeline uses a persistent Gradle build cache. Without it, every CI build starts cold and gains nothing from modularization.

Teams also frequently ignore the cost of annotation processing (KSP/KAPT) across modules. Every module that uses Hilt, Room, or Moshi code generation pays the cost of running the annotation processor during compilation. If a module doesn't need code generation, don't apply the KSP or KAPT plugin. For example, `:core:navigation` probably only contains route definitions and utility functions — it doesn't need Hilt or Room processing. Removing unnecessary annotation processing plugins from modules that don't need them can save 2-5 seconds per module per build.

The critical optimization is minimizing the depth of the dependency chain. If modules form a linear chain, they must build sequentially. A flat, wide dependency graph maximizes parallelism.

Build cache is another powerful optimization. Gradle's build cache stores task outputs and reuses them when inputs have not changed. Enable `org.gradle.caching=true` and remote cache for CI.

Use `api` vs `implementation` correctly. `implementation` hides the dependency from downstream modules. `api` exposes it. Misusing `api` creates unnecessary recompilation cascades. Default to `implementation`.

```kotlin
// gradle.properties for maximum build performance
// org.gradle.parallel=true
// org.gradle.caching=true
// org.gradle.configureondemand=true
// kotlin.incremental=true
```

```kotlin
// :feature:search build.gradle.kts
dependencies {
    implementation(project(":core:network:api"))
    implementation(project(":core:database"))
    implementation(project(":core:ui"))
    testImplementation(project(":core:testing"))
}
```

#### Design Pitfalls

A common pitfall is creating a :core:common module that everything depends on. Every change triggers full recompilation. Split into focused modules: :core:formatting, :core:result, :core:extensions.

Another pitfall is not monitoring build times after modularization. Use Gradle's --scan flag to generate build reports.

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

The `require()` function is another weapon in this arsenal. When the type system alone cannot enforce a constraint — say, an age must be between 0 and 150 — you use precondition checks inside constructors or factory functions to fail fast at creation time. The key insight is that `require()` throws `IllegalArgumentException` with a clear message, making debugging straightforward. Combine `require()` with `init` blocks in data classes, and you guarantee that no instance of that class ever exists in an invalid state throughout its entire lifetime.

Sealed classes also shine when modeling screen states in mobile apps. Instead of a data class with `isLoading: Boolean`, `error: String?`, and `data: List<Item>?` — where you can accidentally have `isLoading = true` and `error = "failed"` simultaneously — you define a sealed hierarchy with `Loading`, `Success(data)`, and `Error(message)`. Each state carries only the data relevant to that state. The UI layer uses an exhaustive `when` expression, and the compiler ensures every state is rendered. This pattern eliminates entire categories of UI glitches caused by contradictory state flags.

Beyond simple wrappers, you can use sealed interfaces to encode business rules directly into the type system. Consider an ordering system where a draft order can be edited but not shipped, while a confirmed order can be shipped but not edited. By modeling these as distinct types within a sealed hierarchy — each with its own set of allowed operations — you make it physically impossible to call `ship()` on a draft order. The function simply does not exist on that type. This moves business rule enforcement from runtime if-checks scattered throughout the codebase to a single, compiler-verified type hierarchy.

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

```kotlin
// Using require() to enforce invariants at construction time
data class Age(val value: Int) {
    init {
        require(value in 0..150) { "Age must be 0-150, was $value" }
    }
}

data class Percentage(val value: Double) {
    init {
        require(value in 0.0..100.0) { "Percentage must be 0-100, was $value" }
    }
}

// Age(200) throws IllegalArgumentException immediately
// No invalid Age instance can ever exist in memory
```

```kotlin
// Sealed hierarchy for UI screen state — no contradictory flags
sealed interface ScreenState<out T> {
    data object Loading : ScreenState<Nothing>
    data class Success<T>(val data: T) : ScreenState<T>
    data class Error(val message: String, val retry: () -> Unit) : ScreenState<Nothing>
}

// Exhaustive when — compiler ensures every state is handled
fun render(state: ScreenState<List<User>>) {
    when (state) {
        is ScreenState.Loading -> showSpinner()
        is ScreenState.Success -> showList(state.data)
        is ScreenState.Error -> showError(state.message, state.retry)
    }
}
```

```kotlin
// Encoding business rules in the type system
sealed interface Order {
    val id: OrderId
    val items: List<LineItem>

    data class Draft(
        override val id: OrderId,
        override val items: List<LineItem>,
    ) : Order {
        fun addItem(item: LineItem): Draft = copy(items = items + item)
        fun confirm(): Confirmed = Confirmed(id, items)
    }

    data class Confirmed(
        override val id: OrderId,
        override val items: List<LineItem>,
    ) : Order {
        fun ship(trackingNumber: String): Shipped =
            Shipped(id, items, trackingNumber)
    }

    data class Shipped(
        override val id: OrderId,
        override val items: List<LineItem>,
        val trackingNumber: String,
    ) : Order
}

// draft.ship("123") — does not compile, ship() doesn't exist on Draft
// confirmed.addItem(item) — does not compile, addItem() doesn't exist on Confirmed
```

#### Common Mistakes

The most frequent mistake is overusing `else` branches in `when` expressions on sealed types. When you write `else -> {}` as a catch-all, you lose the compiler's ability to warn you when a new variant is added. Always match each variant explicitly and let the compiler enforce exhaustiveness.

Another common error is making value classes `data class` instead of `@JvmInline value class`. A regular data class wraps the value in a heap-allocated object, which defeats the zero-overhead goal. Always use `@JvmInline` for single-property wrapper types that exist purely for type safety.

Developers sometimes create sealed hierarchies that are too granular or too flat. If you have fifteen variants in a single sealed interface, consider grouping related variants under intermediate sealed interfaces. Conversely, if you have only two variants and one is a `data object Default`, you probably don't need a sealed hierarchy at all — a simple nullable type or a Boolean flag might be clearer.

**Key takeaway:** Use sealed interfaces and value classes to push validation from runtime to compile time. Every bug prevented by the type system is a bug that can never reach production.

### Lesson 8.2: Factory Functions and Smart Constructors

Raw constructors are honest — they expose exactly how an object is built. But sometimes that honesty is a liability. When a constructor takes five parameters, three of which have complex validation rules, you're asking every caller to understand your internal constraints. Factory functions in a `companion object` let you hide that complexity behind a clear, intention-revealing name.

The naming conventions matter. Kotlin's standard library establishes a vocabulary: `of()` for wrapping known-valid values (like `listOf()`), `from()` for parsing or converting (like `Instant.from()`), and `create()` for more involved construction. Following these conventions means your API feels familiar to anyone who's used Kotlin's own APIs. The `orNull()` variant returns `null` instead of throwing — it composes better with Kotlin's null safety features and is preferred when invalid input is expected (user-provided data) rather than exceptional (programmer error).

Private constructors combined with factory functions create a validation firewall. The only way to create an `EmailAddress` is through `from()` or `fromOrNull()`, both of which validate the input. There's no way to construct an invalid `EmailAddress` — the type itself is proof of validity. Any function that accepts `EmailAddress` as a parameter can skip email validation entirely because the type guarantees it's already been validated.

The builder pattern complements factory functions for objects with many optional parameters. While Kotlin's default parameter values reduce the need for builders compared to Java, builders still shine when construction is multi-step or when you need to accumulate items into a collection during configuration. A builder with a fluent API lets callers set only the options they care about while providing sensible defaults for everything else. The key is to validate all constraints in the `build()` method so that the resulting object is always consistent.

Factory functions also enable the strategy pattern cleanly. When you have multiple ways to create a conceptually similar object — say, a `ConnectionPool` configured for high-throughput versus low-latency — named factory functions like `forHighThroughput()` and `forLowLatency()` express intent far better than a constructor with a dozen numeric parameters. The caller doesn't need to know which timeout values or pool sizes correspond to which strategy. The factory function encodes that domain knowledge in one place.

Another powerful technique is using `invoke()` operator overloading in companion objects. This lets you call the class name as if it were a constructor — `Color(0xFF0000)` — while actually routing through a factory function that can cache instances, validate input, or return different subtypes. The caller sees constructor-like syntax; the implementation has full control over object creation. Kotlin's standard library uses this pattern in places like `Regex()` which is actually `Regex.invoke()` under the hood.

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

```kotlin
// Builder pattern for complex multi-step construction
class HttpRequest private constructor(
    val url: String,
    val method: String,
    val headers: Map<String, String>,
    val body: ByteArray?,
    val timeoutMs: Long,
) {
    class Builder(private val url: String) {
        private var method: String = "GET"
        private val headers = mutableMapOf<String, String>()
        private var body: ByteArray? = null
        private var timeoutMs: Long = 30_000

        fun method(method: String) = apply { this.method = method }
        fun header(key: String, value: String) = apply { headers[key] = value }
        fun body(body: ByteArray) = apply { this.body = body }
        fun timeout(ms: Long) = apply { this.timeoutMs = ms }

        fun build(): HttpRequest {
            require(url.startsWith("http")) { "URL must start with http" }
            if (method == "GET") require(body == null) { "GET requests cannot have a body" }
            return HttpRequest(url, method, headers.toMap(), body, timeoutMs)
        }
    }
}

val request = HttpRequest.Builder("https://api.example.com/users")
    .method("POST")
    .header("Content-Type", "application/json")
    .body("""{"name":"Mukul"}""".toByteArray())
    .timeout(5_000)
    .build()
```

```kotlin
// Named factory functions encoding domain strategies
class ConnectionPool private constructor(
    val maxConnections: Int,
    val idleTimeoutMs: Long,
    val acquireTimeoutMs: Long,
) {
    companion object {
        fun forHighThroughput() = ConnectionPool(
            maxConnections = 50,
            idleTimeoutMs = 120_000,
            acquireTimeoutMs = 5_000,
        )

        fun forLowLatency() = ConnectionPool(
            maxConnections = 10,
            idleTimeoutMs = 30_000,
            acquireTimeoutMs = 1_000,
        )

        fun custom(
            maxConnections: Int = 20,
            idleTimeoutMs: Long = 60_000,
            acquireTimeoutMs: Long = 3_000,
        ): ConnectionPool {
            require(maxConnections > 0) { "maxConnections must be positive" }
            return ConnectionPool(maxConnections, idleTimeoutMs, acquireTimeoutMs)
        }
    }
}
```

```kotlin
// Using invoke() operator for constructor-like factory syntax
class Color private constructor(val rgb: Int) {
    companion object {
        private val cache = mutableMapOf<Int, Color>()

        operator fun invoke(rgb: Int): Color {
            require(rgb in 0x000000..0xFFFFFF) { "RGB must be 0x000000-0xFFFFFF" }
            return cache.getOrPut(rgb) { Color(rgb) }
        }

        fun fromHex(hex: String): Color {
            val cleaned = hex.removePrefix("#")
            return invoke(cleaned.toInt(16))
        }
    }

    val red: Int get() = (rgb shr 16) and 0xFF
    val green: Int get() = (rgb shr 8) and 0xFF
    val blue: Int get() = rgb and 0xFF
}

// Looks like a constructor call but goes through the factory
val red = Color(0xFF0000)
val blue = Color.fromHex("#0000FF")
```

#### Common Mistakes

The biggest mistake is exposing a public constructor alongside factory functions. If callers can bypass your `from()` method by calling the constructor directly, your validation is optional, not mandatory. Always make the constructor `private` when you provide factory functions that enforce invariants.

Another error is using `require()` in factory functions that receive user input. User-entered data is expected to be invalid sometimes — use the `orNull()` variant and return `null` instead of throwing. Reserve `require()` for programmer errors where invalid input indicates a bug in the calling code, not bad user data.

Developers also sometimes create builders for classes with only two or three parameters. Kotlin's named arguments and default values handle this case far more concisely. Builders add boilerplate and cognitive overhead — use them only when construction is genuinely multi-step, involves collection accumulation, or the object has more than five or six configurable properties.

The naming conventions matter because they signal intent. `of()` wraps known-valid values. `from()` parses or converts. `create()` performs involved construction. `parse()` handles string-to-type conversion. Following these conventions means your API feels familiar.

Private constructors combined with factory functions create a validation firewall. The only way to create an `EmailAddress` is through validated factory functions. Any function accepting `EmailAddress` can skip validation because the type guarantees validity.

```kotlin
@JvmInline
value class Percentage private constructor(val value: Double) {
    companion object {
        fun of(value: Double): Percentage {
            require(value in 0.0..100.0) { "Percentage must be 0-100, was $value" }
            return Percentage(value)
        }

        fun ofOrNull(value: Double): Percentage? =
            if (value in 0.0..100.0) Percentage(value) else null

        fun fromFraction(fraction: Double): Percentage {
            require(fraction in 0.0..1.0) { "Fraction must be 0-1, was $fraction" }
            return Percentage(fraction * 100)
        }
    }

    fun toFraction(): Double = value / 100.0
}

@JvmInline
value class PhoneNumber private constructor(val value: String) {
    companion object {
        private val PHONE_REGEX = Regex("^\\+[1-9]\\d{1,14}$")

        fun parse(raw: String): PhoneNumber {
            val normalized = raw.replace("[\\s-()]".toRegex(), "")
            require(PHONE_REGEX.matches(normalized)) { "Invalid phone: $raw" }
            return PhoneNumber(normalized)
        }

        fun parseOrNull(raw: String): PhoneNumber? {
            val normalized = raw.replace("[\\s-()]".toRegex(), "")
            return if (PHONE_REGEX.matches(normalized)) PhoneNumber(normalized) else null
        }
    }
}
```

#### Design Pitfalls

The main pitfall is using `require()` for user input validation. `require()` is for programmer errors. For user input, use the OrNull variant.

Another pitfall is making factory functions do too much work. Keep them focused on structural validation. External validation (DNS, uniqueness) belongs in a separate service.

**Key takeaway:** Use private constructors with factory functions to create types that are valid by construction. The `from()` / `fromOrNull()` pattern separates expected-invalid input (return null) from programmer errors (throw exception).

### Lesson 8.3: Designing Evolution-Friendly APIs

APIs evolve. Requirements change, features are added, edge cases are discovered. The way you design your API surface today determines how painful — or painless — changes are tomorrow. The key principles are: make breaking changes impossible (or at least detectable at compile time), use default parameter values for backward-compatible additions, and prefer sealed hierarchies over enums when the set of values might grow.

Default parameter values are Kotlin's best tool for backward-compatible API evolution. When you add a new parameter with a default value, existing callers don't need to change. This is dramatically better than Java's approach of adding method overloads or creating Builder classes for every optional parameter. The catch is that default values work at the source level but not at the binary level — if a library consumer uses your API without recompiling, they won't pick up the default. For internal APIs (same codebase), this isn't a concern.

For APIs where the set of options might grow, prefer sealed interfaces over enums. When you add a new enum value, existing `when` expressions compile fine with a dangling `else` branch that silently ignores the new value. When you add a new sealed class variant, `when` expressions without `else` break at compile time, forcing every consumer to handle the new case. This is exactly what you want — compile-time enforcement that every code path handles every possible state.

Deprecation is the humane way to remove API surface. Kotlin's `@Deprecated` annotation supports three levels: `WARNING` (compiles with a warning), `ERROR` (fails to compile), and `HIDDEN` (invisible to new code but binary-compatible with old compiled code). The `replaceWith` parameter enables IDE quick-fixes that automatically migrate callers. A disciplined deprecation cycle — `WARNING` in version N, `ERROR` in version N+1, `HIDDEN` or removed in version N+2 — gives consumers time to migrate without surprise breakage. Always provide a `ReplaceWith` expression so the migration path is mechanical, not a research project.

Interface segregation is another evolution technique. Instead of one large interface with twenty methods, split it into focused interfaces that each represent a single capability. Consumers depend only on the interfaces they use, so adding methods to one interface doesn't affect consumers of another. This is especially useful for repository or service interfaces in Android apps where different screens need different subsets of operations. When a new feature requires a new method, you add a new interface rather than modifying an existing one.

Versioned data classes provide forward compatibility for serialized data. When your app stores configuration or cached data locally, you need to read data written by older versions. Including a `version` field in your data class and using `when` to handle migration from older formats ensures that app updates don't crash when reading stale caches or SharedPreferences. This technique is essential for any data that persists across app updates.

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

```kotlin
// Deprecation with automatic migration path
class AnalyticsTracker {
    @Deprecated(
        message = "Use trackEvent(AnalyticsEvent) instead for type-safe tracking",
        replaceWith = ReplaceWith(
            "trackEvent(AnalyticsEvent.Custom(name, params))"
        ),
        level = DeprecationLevel.WARNING,
    )
    fun track(name: String, params: Map<String, Any> = emptyMap()) {
        trackEvent(AnalyticsEvent.Custom(name, params))
    }

    fun trackEvent(event: AnalyticsEvent) {
        // New type-safe tracking implementation
    }
}

sealed interface AnalyticsEvent {
    data class ScreenView(val screenName: String) : AnalyticsEvent
    data class ButtonClick(val buttonId: String, val screen: String) : AnalyticsEvent
    data class Custom(val name: String, val params: Map<String, Any>) : AnalyticsEvent
}
```

```kotlin
// Interface segregation for evolution
interface UserReader {
    suspend fun getUser(id: UserId): User?
    suspend fun searchUsers(query: String): List<User>
}

interface UserWriter {
    suspend fun saveUser(user: User)
    suspend fun deleteUser(id: UserId)
}

// New capability added without touching existing interfaces
interface UserPresenceTracker {
    suspend fun setOnline(id: UserId)
    suspend fun getLastSeen(id: UserId): Instant?
}

// Concrete class implements all, but consumers depend on narrow interfaces
class UserRepository : UserReader, UserWriter, UserPresenceTracker {
    override suspend fun getUser(id: UserId): User? = TODO()
    override suspend fun searchUsers(query: String): List<User> = TODO()
    override suspend fun saveUser(user: User) = TODO()
    override suspend fun deleteUser(id: UserId) = TODO()
    override suspend fun setOnline(id: UserId) = TODO()
    override suspend fun getLastSeen(id: UserId): Instant? = TODO()
}

// ProfileScreen only depends on UserReader — immune to changes in UserWriter
class ProfileViewModel(private val users: UserReader) {
    suspend fun loadProfile(id: UserId) = users.getUser(id)
}
```

```kotlin
// Versioned data for forward-compatible serialization
@Serializable
data class AppConfig(
    val version: Int = CURRENT_VERSION,
    val theme: String = "system",
    val notificationsEnabled: Boolean = true,
    val syncIntervalMinutes: Int = 15,
    // Added in version 2
    val offlineModeEnabled: Boolean = false,
) {
    companion object {
        const val CURRENT_VERSION = 2

        fun migrate(json: JsonObject): AppConfig {
            val version = json["version"]?.jsonPrimitive?.int ?: 1
            return when (version) {
                1 -> AppConfig(
                    theme = json["theme"]?.jsonPrimitive?.content ?: "system",
                    notificationsEnabled = json["notificationsEnabled"]
                        ?.jsonPrimitive?.boolean ?: true,
                    syncIntervalMinutes = json["syncIntervalMinutes"]
                        ?.jsonPrimitive?.int ?: 15,
                    offlineModeEnabled = false,
                )
                CURRENT_VERSION -> Json.decodeFromJsonElement(json)
                else -> AppConfig() // Unknown future version, use defaults
            }
        }
    }
}
```

#### Common Mistakes

The most common mistake is adding `else` branches to `when` expressions over sealed types. The moment you write `else -> { }`, you've opted out of compile-time safety. When a new variant is added, the `else` branch silently swallows it instead of forcing you to handle it explicitly. Resist the urge to add a catch-all even when the linter suggests it.

Another frequent error is deprecating an API without providing a `ReplaceWith` expression. A deprecation warning without a migration path just annoys consumers. Always include `replaceWith` so the IDE can automate the migration. If the migration is complex, at minimum write clear documentation in the `message` parameter explaining what to do.

Developers also make the mistake of breaking binary compatibility when evolving library APIs. Adding a new parameter without a default value, changing a return type, or renaming a function all break consumers who haven't recompiled. For library APIs shared across modules or teams, always add new parameters with defaults, never remove parameters in the same major version, and use `@Deprecated(level = HIDDEN)` instead of deletion for binary compatibility.

Default parameter values are Kotlin's best tool for backward-compatible API evolution. When you add a new parameter with a default value, existing callers do not need to change.

For APIs where the set of options might grow, sealed interfaces are superior to enums. When you add a new sealed variant, `when` expressions without `else` break at compile time.

The `@Deprecated` annotation is your friend during API evolution. Before removing a function, deprecate it first with a `replaceWith` clause that IDEs can auto-apply.

```kotlin
@Deprecated(
    message = "Use getUser(UserId) instead for type safety",
    replaceWith = ReplaceWith("getUser(UserId(id))"),
    level = DeprecationLevel.WARNING,
)
suspend fun getUser(id: String): User = getUser(UserId(id))

suspend fun getUser(id: UserId): User = repository.getUser(id)
```

Versioning your internal APIs helps track breaking changes across modules. When a core module changes its public interface, bump its version. Downstream modules can be updated systematically.

```kotlin
object NetworkApiVersion {
    const val CURRENT = 3
    // v1: String-based error codes
    // v2: Sealed class error hierarchy
    // v3: Circuit breaker support
}
```

**Key takeaway:** Design APIs for evolution. Use default parameter values for backward-compatible additions. Prefer sealed interfaces over enums when the variant set may grow — they provide compile-time enforcement that every consumer handles every case.

### Lesson 8.4: Result Types and Error Handling

Every API function that can fail should communicate failure through its return type, not through exceptions. Exceptions are invisible in the type system — you can't tell by looking at a function signature whether it throws. Result types make success and failure explicit: the caller must handle both cases because the type system requires it. This eliminates an entire class of bugs where error paths are forgotten.

Kotlin's built-in `Result<T>` type works for simple cases, but for domain-specific APIs, a custom sealed hierarchy is more expressive. You can add domain-specific error variants (not found, validation failed, unauthorized, rate limited) that carry structured error data. The caller pattern-matches on the result and handles each case explicitly. No exception catching, no unchecked error propagation, no "this should never happen" comments on error branches.

For repository layers that bridge multiple error domains (network errors, database errors, business logic errors), define a domain-specific error hierarchy that maps from infrastructure errors. The repository translates `IOException` into `DataError.Network`, `HttpException(404)` into `DataError.NotFound`, and `SQLiteConstraintException` into `DataError.Conflict`. Callers work with domain errors, not infrastructure exceptions.

Kotlin's `runCatching` function bridges the gap between exception-throwing APIs and result-based code. It wraps any block in a try-catch and returns a `Result<T>`. This is useful at the boundary where you call third-party libraries that throw exceptions — you convert their exceptions into `Result` values at the edge and propagate results through your own code. However, `runCatching` catches all exceptions including `CancellationException`, which breaks structured concurrency. In coroutine code, always re-throw `CancellationException` or use a custom version that's coroutine-aware.

The `fold()` pattern on result types provides a clean way to transform both success and failure cases in a single expression. Instead of nested `if-else` blocks or separate `onSuccess`/`onFailure` calls, `fold` takes two lambdas and returns a single value. This composes beautifully with ViewModel state mapping — the repository returns a `DataResult<User>`, and the ViewModel folds it into a `ScreenState.Success` or `ScreenState.Error`. One line, both cases handled, no possibility of forgetting the error path.

Error hierarchies should be designed with the consumer in mind, not the producer. The question isn't "what went wrong internally?" but "what can the caller do about it?" A network timeout, a DNS failure, and a connection reset are all different internally, but the caller's response is the same: retry or show an offline message. Group errors by recovery action, not by root cause. This keeps the error hierarchy small and the `when` expressions manageable.

Extension functions on result types make error handling composable. You can define `mapError()` to transform error types, `recover()` to provide fallback values, `flatMap()` to chain operations that each return results, and `onError()` for side effects like logging. These combinators let you build error-handling pipelines that read top-to-bottom without nesting. Each step in the pipeline either passes the success value through or transforms the error, and the final `fold()` at the UI boundary converts everything into a screen state.

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

```kotlin
// Coroutine-safe runCatching that respects CancellationException
suspend fun <T> safeRunCatching(block: suspend () -> T): Result<T> {
    return try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e // Never catch cancellation — it breaks structured concurrency
    } catch (e: Throwable) {
        Result.failure(e)
    }
}

// Usage in a ViewModel
class ProfileViewModel(private val repo: UserRepository) : ViewModel() {
    fun loadUser(id: String) {
        viewModelScope.launch {
            val result = safeRunCatching { repo.fetchUserOrThrow(id) }
            _state.value = result.fold(
                onSuccess = { ScreenState.Success(it) },
                onFailure = { ScreenState.Error(it.message ?: "Unknown error") },
            )
        }
    }
}
```

```kotlin
// Extension functions for composable error handling
fun <L, R, T> Either<L, R>.map(transform: (R) -> T): Either<L, T> = when (this) {
    is Either.Left -> this
    is Either.Right -> Either.Right(transform(value))
}

fun <L, R, T> Either<L, R>.flatMap(transform: (R) -> Either<L, T>): Either<L, T> =
    when (this) {
        is Either.Left -> this
        is Either.Right -> transform(value)
    }

fun <L, R> Either<L, R>.recover(fallback: (L) -> R): Either<L, R> = when (this) {
    is Either.Left -> Either.Right(fallback(value))
    is Either.Right -> this
}

fun <L, R> Either<L, R>.onError(action: (L) -> Unit): Either<L, R> = also {
    if (this is Either.Left) action(value)
}
```

```kotlin
// Composable pipeline: fetch, transform, handle errors
suspend fun loadProfileScreen(userId: String): ScreenState<ProfileUi> {
    return userRepository.getUser(userId)
        .map { user -> user.toProfileUi() }
        .onError { error -> analytics.trackError("profile_load", error) }
        .fold(
            onLeft = { error ->
                when (error) {
                    is DataError.Network -> ScreenState.Error(
                        "No connection", retry = { loadProfileScreen(userId) }
                    )
                    is DataError.NotFound -> ScreenState.Error("User not found")
                    is DataError.Unauthorized -> ScreenState.Error("Session expired")
                    is DataError.RateLimited -> ScreenState.Error("Too many requests")
                    is DataError.Validation -> ScreenState.Error(error.message)
                    is DataError.Unknown -> ScreenState.Error("Something went wrong")
                }
            },
            onRight = { profileUi -> ScreenState.Success(profileUi) },
        )
}
```

#### Common Mistakes

The most dangerous mistake is using `runCatching` in coroutine code without re-throwing `CancellationException`. When a coroutine is cancelled, `runCatching` catches the `CancellationException` and wraps it in a `Result.failure`, preventing the cancellation from propagating. This breaks structured concurrency and can cause coroutine leaks. Always use a coroutine-safe variant that explicitly re-throws `CancellationException`.

Another common error is creating error hierarchies that are too granular. If your sealed class has fifteen error variants and callers always handle twelve of them identically, your hierarchy is modeling implementation details, not caller-relevant distinctions. Group errors by what the caller can do about them — retry, show a message, redirect to login — not by what went wrong internally.

Developers sometimes mix exceptions and result types in the same API layer. A repository that returns `DataResult<User>` for one method and throws `IOException` for another forces callers to use two different error-handling strategies. Pick one approach per layer and apply it consistently. Use exceptions at infrastructure boundaries (where third-party libraries throw), and convert to result types at the repository boundary so that all domain code works with results exclusively.

**Key takeaway:** Use result types instead of exceptions for expected failures. Define a domain-specific error hierarchy that maps from infrastructure exceptions. This makes error handling explicit, exhaustive, and visible in the type system.

### Lesson 8.5: DSL-Style Configuration APIs

Kotlin's lambda-with-receiver syntax enables DSL-style APIs that are both type-safe and readable. Instead of chained builder methods or constructor parameters, you create a configuration block that reads like a specification. This pattern is used throughout the Kotlin ecosystem — Ktor's routing, Gradle's build scripts, Jetpack Compose — because it provides discoverability (IDE completion inside the block), validation (the builder can check constraints before building), and readability (the configuration reads as English).

The pattern has three parts: a builder class with mutable properties, a factory function that creates the builder, runs the lambda, and returns the built object, and an `@DslMarker` annotation that prevents scope leaking (accidentally accessing outer builder properties from an inner block). For simple configurations, `data class` with `copy()` works just as well and is less code. Reserve DSL builders for complex, nested configurations where readability justifies the extra machinery.

The `@DslMarker` annotation deserves special attention. Without it, nested lambdas can access properties from any enclosing receiver. Inside a `retry { }` block within a `networkClient { }` block, you could accidentally set `baseUrl` — a property of the outer builder. `@DslMarker` makes this a compile error. You create a custom annotation (like `@NetworkDsl`), apply it to all builder classes, and the compiler ensures each lambda can only access members of its immediate receiver. This prevents subtle bugs where inner blocks accidentally modify outer state.

Extension functions on builder classes enable modular, reusable configuration fragments. Instead of duplicating the same retry configuration across ten different client setups, you define `fun NetworkClientBuilder.withProductionDefaults()` that sets all the standard timeouts, retry policies, and interceptors. Callers apply it with a single function call and then override only what differs. This pattern keeps configuration DRY while preserving the flexibility of the DSL.

Operator overloading can make DSLs even more expressive. The `unaryPlus` operator on strings lets you write `+"header text"` inside a builder to add items to a list. The `invoke` operator lets you write `route("/api") { }` as if `route` were a function, even when it's an object. These techniques should be used sparingly — they improve readability when the metaphor is natural, but obscure intent when overused. A good rule of thumb: if the operator's meaning isn't immediately obvious to someone unfamiliar with your DSL, use a named function instead.

Type-safe builders can enforce ordering constraints that plain constructors cannot. A builder that requires `baseUrl` to be set before `build()` can check this in the `build()` method with `require()`. More sophisticated builders use phantom types or staged builders to enforce at compile time that certain properties must be set. For example, a `RequestBuilder<NoUrl>` that returns a `RequestBuilder<HasUrl>` from `url()` — and only `RequestBuilder<HasUrl>` has a `build()` method — ensures you can never build a request without a URL. This is advanced but powerful for safety-critical APIs.

Nesting builders creates hierarchical configurations that mirror the structure of the thing being configured. A test fixture DSL, for instance, lets you declare users with addresses and orders in a tree structure that reads like a data specification. Each nesting level has its own builder class, its own `@DslMarker`-annotated scope, and its own validation in the `build()` method. The result is that test setup code reads like English and validates itself at build time.

For very simple configuration needs, avoid the ceremony of a full DSL builder. A data class with default parameters and Kotlin's `copy()` method provides 80% of the value with 20% of the code. Use DSL builders when you have nested configuration (builders within builders), collection accumulation (adding interceptors, routes, or rules), or complex validation that spans multiple properties. For flat configurations with five or six properties, a data class with named arguments is almost always the better choice.

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

```kotlin
// @DslMarker preventing scope leaking
@DslMarker
annotation class HtmlDsl

@HtmlDsl
class HtmlBuilder {
    private val children = mutableListOf<String>()

    fun head(block: HeadBuilder.() -> Unit) {
        children.add(HeadBuilder().apply(block).build())
    }

    fun body(block: BodyBuilder.() -> Unit) {
        children.add(BodyBuilder().apply(block).build())
    }

    fun build(): String = children.joinToString("\n")
}

@HtmlDsl
class BodyBuilder {
    private val elements = mutableListOf<String>()

    fun p(text: String) { elements.add("<p>$text</p>") }
    fun h1(text: String) { elements.add("<h1>$text</h1>") }

    // Inside body { }, calling head { } is a compile error
    // because @HtmlDsl prevents accessing HtmlBuilder's members

    fun build(): String = "<body>${elements.joinToString("")}</body>"
}
```

```kotlin
// Reusable configuration fragments via extension functions
fun NetworkClientBuilder.withProductionDefaults() {
    connectTimeoutMs = 10_000
    readTimeoutMs = 30_000
    writeTimeoutMs = 15_000
    retry {
        maxRetries = 3
        initialDelayMs = 1_000
        exponentialBackoff = true
    }
    addInterceptor(LoggingInterceptor(level = LogLevel.BASIC))
}

fun NetworkClientBuilder.withDebugDefaults() {
    connectTimeoutMs = 60_000
    readTimeoutMs = 60_000
    writeTimeoutMs = 60_000
    retry { maxRetries = 0 }
    addInterceptor(LoggingInterceptor(level = LogLevel.BODY))
}

// Callers apply preset and override only what differs
val prodClient = networkClient {
    withProductionDefaults()
    baseUrl = "https://api.example.com"
}
```

```kotlin
// Test fixture DSL for readable test setup
@DslMarker
annotation class TestFixtureDsl

@TestFixtureDsl
class UserFixtureBuilder {
    var name: String = "Test User"
    var email: String = "test@example.com"
    private val orders = mutableListOf<Order>()

    fun order(block: OrderBuilder.() -> Unit) {
        orders.add(OrderBuilder().apply(block).build())
    }

    fun build(): User = User(name = name, email = email, orders = orders)
}

@TestFixtureDsl
class OrderBuilder {
    var product: String = "Widget"
    var quantity: Int = 1
    var priceInCents: Long = 999

    fun build(): Order {
        require(quantity > 0) { "Quantity must be positive" }
        return Order(product, quantity, priceInCents)
    }
}

fun testUser(block: UserFixtureBuilder.() -> Unit): User =
    UserFixtureBuilder().apply(block).build()

// Test reads like a specification
val user = testUser {
    name = "Mukul"
    email = "mukul@example.com"
    order {
        product = "Kotlin Book"
        quantity = 2
        priceInCents = 3999
    }
    order {
        product = "IntelliJ License"
        quantity = 1
        priceInCents = 14900
    }
}
```

```kotlin
// Operator overloading for expressive DSLs (use sparingly)
@DslMarker
annotation class RouteDsl

@RouteDsl
class RouteBuilder {
    private val routes = mutableListOf<Route>()

    operator fun String.invoke(
        method: HttpMethod = HttpMethod.GET,
        handler: suspend (Request) -> Response,
    ) {
        routes.add(Route(this, method, handler))
    }

    infix fun String.to(handler: suspend (Request) -> Response) {
        routes.add(Route(this, HttpMethod.GET, handler))
    }

    fun build(): List<Route> = routes.toList()
}

fun routes(block: RouteBuilder.() -> Unit): List<Route> =
    RouteBuilder().apply(block).build()

// Clean routing DSL
val appRoutes = routes {
    "/users"(HttpMethod.GET) { req -> fetchUsers(req) }
    "/users"(HttpMethod.POST) { req -> createUser(req) }
    "/health" to { _ -> Response(200, "OK") }
}
```

#### Common Mistakes

The most common mistake is omitting `@DslMarker`. Without it, nested lambda blocks can access properties from outer scopes, leading to subtle bugs. Inside `retry { }`, you can accidentally set `baseUrl` because the `NetworkClientBuilder` receiver is still in scope. Always create a marker annotation and apply it to every builder class in your DSL.

Another frequent error is making DSL builders mutable after `build()` is called. Once `build()` returns an immutable object, the builder should not be reused. Either throw if `build()` is called twice, or make `build()` idempotent by always computing from the current state. Reusing builders leads to shared-state bugs that are extremely hard to trace.

Developers also overuse operator overloading in DSLs. Just because Kotlin lets you overload `+`, `invoke`, and `unaryPlus` doesn't mean you should. If a reader has to look up the operator's meaning to understand the DSL, you've traded explicitness for cleverness. Named functions like `addRoute()` or `include()` are almost always clearer than custom operators. Reserve operator overloading for cases where the mathematical or natural-language metaphor is universally understood.

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

Every network call in your app can fail in two fundamentally different ways, and your architecture must distinguish between them. An `HttpException` means the server received your request and responded with an error — you have a status code, a message, and possibly an error body to parse. An `IOException` means the request never completed — the network was down, DNS failed, the connection timed out, or the server closed the connection. These require different handling: HTTP errors might be retryable (503) or permanent (404), while IO errors are almost always worth retrying. Treating both the same way leads to retry logic that hammers the server with invalid requests or gives up too easily on transient network blips.

The foundation of a robust networking layer is a sealed class that models all three outcomes explicitly. A `NetworkResult` sealed class with `Success`, `Error`, and `Exception` variants forces every caller to handle each case at compile time. The `Success` variant carries the parsed response data. The `Error` variant carries the HTTP status code, message, and optional error body for server-side error parsing. The `Exception` variant wraps the throwable for network failures and deserialization errors. This eliminates the scattered try-catch blocks that plague most Android codebases.

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
```

The `safeApiCall` wrapper encapsulates error classification into a single function that every repository method calls. It catches `HttpException` for server errors, `IOException` for network failures, and `SerializationException` for JSON parsing errors — all mapped into the appropriate `NetworkResult` variant. This means a 200 response with malformed JSON does not crash the app; it becomes a typed `Exception` result that the UI layer can display gracefully. Every API call in the entire app goes through this single function, guaranteeing consistent behavior.

```kotlin
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

To build composable API flows, the `NetworkResult` type should support `flatMap` for chaining dependent calls. When fetching an order requires first fetching the order metadata and then fetching its items, `flatMap` short-circuits on the first failure without executing the second call. This avoids deeply nested callback structures and keeps the error propagation automatic. The caller only handles the final result, not intermediate failures.

```kotlin
suspend fun <T, R> NetworkResult<T>.flatMap(
    transform: suspend (T) -> NetworkResult<R>,
): NetworkResult<R> = when (this) {
    is NetworkResult.Success -> transform(data)
    is NetworkResult.Error -> this
    is NetworkResult.Exception -> this
}

suspend fun getOrderWithItems(orderId: String): NetworkResult<OrderWithItems> {
    return safeApiCall { api.getOrder(orderId) }
        .flatMap { order ->
            safeApiCall { api.getOrderItems(orderId) }
                .map { items -> OrderWithItems(order, items) }
        }
}
```

Integrating `NetworkResult` with Retrofit requires a custom `CallAdapter.Factory` so that Retrofit service interfaces return `NetworkResult` directly instead of raw `Response` objects. This pushes the safe-call logic into Retrofit's plumbing, eliminating the need to manually wrap every repository method. The adapter intercepts the call, executes it safely, and returns the typed result. With this in place, your Retrofit interface methods declare `suspend fun getUser(id: String): NetworkResult<User>`, and the wrapping is invisible to callers.

```kotlin
class NetworkResultCallAdapterFactory : CallAdapter.Factory() {
    override fun get(
        returnType: Type,
        annotations: Array<out Annotation>,
        retrofit: Retrofit,
    ): CallAdapter<*, *>? {
        if (getRawType(returnType) != NetworkResult::class.java) return null
        val responseType = getParameterUpperBound(0, returnType as ParameterizedType)
        return NetworkResultCallAdapter<Any>(responseType)
    }
}

class NetworkResultCallAdapter<T>(
    private val responseType: Type,
) : CallAdapter<T, NetworkResult<T>> {
    override fun responseType(): Type = responseType
    override fun adapt(call: Call<T>): NetworkResult<T> {
        return try {
            val response = call.execute()
            if (response.isSuccessful) {
                NetworkResult.Success(response.body()!!)
            } else {
                NetworkResult.Error(response.code(), response.message())
            }
        } catch (e: IOException) {
            NetworkResult.Exception(e)
        }
    }
}
```

Not all HTTP errors are equal, and a production error handler must classify them for different recovery actions. A 401 triggers re-authentication. A 429 signals rate limiting and requires backing off. A 404 means the resource does not exist and retrying is pointless. A 503 means the server is temporarily unavailable and a retry with backoff is appropriate. Building a classifier that maps status codes to recovery strategies keeps this logic centralized instead of scattered across dozens of call sites.

```kotlin
fun classifyHttpError(code: Int): ErrorAction = when (code) {
    401 -> ErrorAction.RE_AUTHENTICATE
    403 -> ErrorAction.SHOW_FORBIDDEN
    404 -> ErrorAction.SHOW_NOT_FOUND
    429 -> ErrorAction.BACK_OFF
    in 500..599 -> ErrorAction.RETRY
    else -> ErrorAction.SHOW_GENERIC_ERROR
}

enum class ErrorAction {
    RE_AUTHENTICATE, SHOW_FORBIDDEN, SHOW_NOT_FOUND,
    BACK_OFF, RETRY, SHOW_GENERIC_ERROR
}

fun classifyException(e: Exception): ExceptionType = when (e) {
    is IOException -> ExceptionType.NETWORK
    is HttpException -> ExceptionType.HTTP
    is SerializationException -> ExceptionType.PARSE
    is CancellationException -> throw e // Never swallow cancellation
    else -> ExceptionType.UNEXPECTED
}

enum class ExceptionType { NETWORK, HTTP, PARSE, UNEXPECTED }
```

#### Common Mistakes

The most dangerous mistake is catching `CancellationException`. Coroutine cancellation relies on this exception propagating up the call stack. Swallowing it breaks structured concurrency and causes coroutine leaks. Always rethrow `CancellationException` or use a catch clause that excludes it explicitly.

Another common mistake is treating all HTTP errors identically with a generic "Something went wrong" message. Users deserve actionable feedback: "Please log in again" for 401, "You've been rate limited, try again in 30 seconds" for 429, "This item no longer exists" for 404. The error body often contains structured JSON with specific error codes — parse it and surface the right message.

A third mistake is reading the error body outside the `safeApiCall` wrapper. The error body stream can only be read once, and reading it after the response is closed throws an exception. Always read `errorBody()?.string()` inside the catch block while the response is still open.

**Key takeaway:** Wrap every API call in a typed result that distinguishes HTTP errors from network exceptions. This standardizes error handling across the codebase and makes error paths explicit and testable.

### Lesson 9.2: Connection Management and HTTP/2

Connection management is the single most impactful thing you can optimize for network performance on mobile. Most of the time, when someone says "our API calls are slow," the problem is not bandwidth or payload size — it is connection setup. DNS resolution takes 50-200ms. The TCP three-way handshake adds another round trip. The TLS handshake for HTTPS adds one to two more round trips. Then TCP slow start ramps up the congestion window gradually. All told, a cold connection can add 500-1200ms before a single byte of application data flows. Subsequent requests on the same connection skip all of this overhead entirely.

HTTP/2 multiplexing is the key advancement that changes how you think about connections. In HTTP/1.1, each connection can handle only one request-response pair at a time, so browsers open 6 connections per host to achieve parallelism. HTTP/2 interleaves multiple request and response streams over a single TCP connection as binary frames. OkHttp negotiates HTTP/2 automatically during the TLS handshake via ALPN (Application-Layer Protocol Negotiation). With HTTP/2, the optimal number of connections to a single host is often just one. Opening more connections actually hurts because you lose the multiplexing benefit and pay the setup cost multiple times.

The most important rule for connection management is using one shared `OkHttpClient` instance for the entire app. The `ConnectionPool` inside OkHttp manages idle connections and reuses them for subsequent requests. If you create multiple `OkHttpClient` instances — which is a common mistake in large codebases — each one gets its own connection pool, and you lose all connection reuse between them. Use `newBuilder()` to create variants with different timeout and retry policies that share the same connection pool and dispatcher.

```kotlin
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

The `ConnectionPool` constructor takes two parameters that control connection lifecycle. The `maxIdleConnections` parameter sets how many idle connections OkHttp keeps alive for reuse. The `keepAliveDuration` sets how long an idle connection survives before being evicted. Setting `maxIdleConnections` too low (like 1 or 2) causes frequent connection teardowns and rebuilds. Setting it too high wastes memory and file descriptors. For most apps, 5-10 idle connections with a 5-minute keep-alive provides the right balance between reuse and resource consumption.

```kotlin
fun monitorConnectionPool(pool: ConnectionPool) {
    val idleCount = pool.idleConnectionCount()
    val totalCount = pool.connectionCount()
    val activeCount = totalCount - idleCount
    Log.d("ConnectionPool", "Active: $activeCount, Idle: $idleCount, Total: $totalCount")
}
```

The `Dispatcher` controls concurrency limits. The `maxRequests` parameter caps total in-flight requests across all hosts (default 64). The `maxRequestsPerHost` caps requests to any single host (default 5). On HTTP/2 connections where multiplexing handles parallelism at the protocol level, `maxRequestsPerHost` can be raised because the requests share a single connection. Setting it to 10-15 for HTTP/2 hosts allows more concurrent streams without opening additional connections. For HTTP/1.1 hosts, keep it lower to avoid exhausting the connection pool.

```kotlin
val dispatcher = Dispatcher().apply {
    maxRequests = 64
    maxRequestsPerHost = 15 // Higher for HTTP/2 multiplexing
}

// Use an idle callback to detect when all requests are done
dispatcher.idleCallback = Runnable {
    Log.d("Dispatcher", "All requests completed — dispatcher is idle")
}
```

Connection prewarming is an advanced technique for latency-sensitive flows. If you know the user is about to navigate to a screen that loads data from a specific host, you can prewarm the connection by making a lightweight HEAD request beforehand. This pays the DNS, TCP, and TLS cost before the user actually needs the data. OkHttp will reuse that connection for the subsequent real request. This is especially effective before login flows, checkout flows, or any screen transition where you know the target host in advance.

```kotlin
fun prewarmConnection(client: OkHttpClient, url: String) {
    val request = Request.Builder()
        .url(url)
        .head()
        .build()

    client.newCall(request).enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            // Prewarm failure is non-critical — ignore silently
        }
        override fun onResponse(call: Call, response: Response) {
            response.close()
        }
    })
}
```

#### Common Mistakes

The most pervasive mistake is creating a new `OkHttpClient` in every repository, ViewModel, or Dagger module. Each instance gets its own connection pool, dispatcher, and thread pool. Three instances means three separate connection pools with zero reuse between them, tripling your connection setup costs. Always inject a single shared instance.

Another mistake is ignoring HTTP/2 server push and multiplexing by setting `maxRequestsPerHost` to 1. This serializes all requests and eliminates the primary benefit of HTTP/2. If your server supports HTTP/2, raise the per-host limit to leverage multiplexing.

A subtle mistake is setting `keepAliveDuration` too short. If your keep-alive is 30 seconds but the user takes 45 seconds to read a screen before scrolling, every scroll triggers a cold connection. Five minutes is a reasonable default that covers most user interaction patterns.

**Key takeaway:** Use a single shared OkHttpClient with HTTP/2 multiplexing for maximum connection reuse. Create variants with `newBuilder()` for different timeout and retry policies — they share the same connection pool and dispatcher.

### Lesson 9.3: Retry with Exponential Backoff

When a network call fails with a transient error — a timeout, 503 Service Unavailable, or connection reset — the right response is to wait and retry. But naive retrying, immediately hammering the server with repeated requests, makes the problem worse. If the server is overloaded and 10,000 clients immediately retry, they amplify the load that caused the failure in the first place. Exponential backoff solves this by geometrically increasing the wait time between retries: 1 second, 2 seconds, 4 seconds, 8 seconds. This gives the server breathing room to recover while still providing automated recovery for the client.

Adding jitter (randomness) to the backoff is essential for preventing thundering herd problems. If 1,000 clients all fail at the same time and all use the same deterministic backoff schedule, they all retry at exactly the same times — creating synchronized retry storms that are just as bad as immediate retries. Jitter randomizes the retry timing so clients spread their retries across the delay window. Full jitter (randomizing the entire delay) provides the best distribution, but even small jitter factors of 10-20% significantly reduce retry correlation across clients.

The implementation must cap the maximum delay to prevent unreasonably long waits. Without a cap, exponential growth (1s, 2s, 4s, 8s, 16s, 32s, 64s) could make users wait over a minute between retries. Capping at 10-30 seconds provides backoff benefits without excessive delays. The retry predicate is equally important: only retry on transient errors. Retrying a 400 Bad Request or 401 Unauthorized is pointless because the same request will always fail with the same error.

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
            if (e is CancellationException) throw e
            if (!retryOn(e) || attempt == maxRetries - 1) throw e

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

Server-provided retry hints should take priority over client-calculated backoff. When the server returns a `Retry-After` header with a 429 or 503 response, it is telling you exactly when to retry. Ignoring this and using your own backoff schedule wastes resources — either retrying too soon (getting rejected again) or waiting too long (unnecessary delay). A production retry implementation should extract and respect the `Retry-After` header when present, falling back to exponential backoff only when the server does not provide guidance.

```kotlin
suspend fun <T> retryWithServerHints(
    maxRetries: Int = 3,
    initialDelayMs: Long = 1000,
    maxDelayMs: Long = 10_000,
    block: suspend () -> T,
): T {
    var currentDelay = initialDelayMs
    repeat(maxRetries) { attempt ->
        try {
            return block()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            if (!isRetryable(e) || attempt == maxRetries - 1) throw e
            val serverDelay = extractRetryAfter(e)
            val effectiveDelay = serverDelay ?: currentDelay
            val jitter = (effectiveDelay * 0.5 * Math.random()).toLong()
            delay(effectiveDelay + jitter)
            currentDelay = (currentDelay * 2.0).toLong().coerceAtMost(maxDelayMs)
        }
    }
    error("Unreachable")
}

private fun isRetryable(e: Exception): Boolean = when (e) {
    is IOException -> true
    is HttpException -> e.code() in setOf(408, 429, 500, 502, 503, 504)
    else -> false
}

private fun extractRetryAfter(e: Exception): Long? {
    if (e !is HttpException) return null
    return e.response()?.headers()?.get("Retry-After")?.toLongOrNull()?.times(1000)
}
```

For OkHttp-level retries that operate below the coroutine layer, an `Interceptor`-based retry mechanism is useful. This handles retries transparently for all requests without requiring each call site to wrap its calls in retry logic. The interceptor catches failures, applies backoff, and re-executes the request through the chain. This approach works for both synchronous and asynchronous OkHttp calls and integrates cleanly with the interceptor architecture.

```kotlin
class RetryInterceptor(
    private val maxRetries: Int = 3,
    private val initialDelayMs: Long = 1000,
    private val maxDelayMs: Long = 10_000,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        var currentDelay = initialDelayMs

        repeat(maxRetries) { attempt ->
            try {
                val response = chain.proceed(request)
                if (response.isSuccessful || !isRetryableCode(response.code)) {
                    return response
                }
                response.close()
            } catch (e: IOException) {
                if (attempt == maxRetries - 1) throw e
            }
            Thread.sleep(currentDelay)
            currentDelay = (currentDelay * 2).coerceAtMost(maxDelayMs)
        }
        return chain.proceed(request)
    }

    private fun isRetryableCode(code: Int): Boolean =
        code in setOf(408, 429, 500, 502, 503, 504)
}
```

Retry budgets are an advanced technique used by systems like gRPC to limit the total retry load on a service. Instead of each request independently deciding to retry, a retry budget tracks the ratio of retries to total requests over a sliding window. If more than a configured percentage (typically 10-20%) of requests are retries, new retries are suppressed. This prevents cascading failure scenarios where retry storms overwhelm an already struggling service. On mobile, implementing a lightweight retry budget prevents pathological cases where background sync, foreground requests, and prefetch all retry simultaneously.

```kotlin
class RetryBudget(
    private val maxRetryRatio: Double = 0.2,
    private val windowMs: Long = 60_000,
) {
    private val requests = mutableListOf<Long>()
    private val retries = mutableListOf<Long>()

    @Synchronized
    fun recordRequest() {
        val now = System.currentTimeMillis()
        requests.add(now)
        evictOld(now)
    }

    @Synchronized
    fun canRetry(): Boolean {
        val now = System.currentTimeMillis()
        evictOld(now)
        if (requests.isEmpty()) return true
        val retryRatio = retries.size.toDouble() / requests.size
        return retryRatio < maxRetryRatio
    }

    @Synchronized
    fun recordRetry() {
        retries.add(System.currentTimeMillis())
    }

    private fun evictOld(now: Long) {
        requests.removeAll { now - it > windowMs }
        retries.removeAll { now - it > windowMs }
    }
}
```

#### Common Mistakes

The most dangerous retry mistake is retrying non-idempotent operations. If you retry a POST to create an order and the first request actually succeeded but the response was lost due to a timeout, you create a duplicate order. Always use idempotency keys for non-idempotent operations — the server checks if the key was already processed and returns the cached response instead of executing again.

Another common mistake is retrying without checking `CancellationException`. If the coroutine is cancelled (user navigated away, scope was cleared), the retry loop should stop immediately. Catching all exceptions and retrying swallows the cancellation signal and keeps the coroutine alive when it should be dead.

A subtle mistake is using `Thread.sleep()` instead of `delay()` in coroutine-based retry logic. `Thread.sleep()` blocks the thread, wasting resources and preventing cancellation during the sleep period. Always use `delay()` in suspend functions — it is cancellable and does not block the thread.

**Key takeaway:** Use exponential backoff with jitter for transient network failures. Cap the maximum delay to keep retries practical. Only retry transient errors — retrying permanent errors wastes time and resources.

### Lesson 9.4: Request Deduplication

When multiple parts of your app simultaneously request the same data — a user profile displayed in the header, the side panel, and the settings screen — naive implementations make three separate API calls. Request deduplication ensures that concurrent identical requests share a single in-flight API call. The first request triggers the actual network call. Subsequent requests with the same key await the result of the already-in-flight call. When the result arrives, all callers receive it simultaneously. This is not caching; caching serves stale data from a previous request, while deduplication shares a single live request among concurrent callers.

The core implementation uses a `ConcurrentHashMap` of in-flight `Deferred` objects keyed by a request identifier. When a request arrives, check if there is an active deferred for that key. If yes, await it. If no, create a new coroutine, store its deferred, execute the request, and clean up the key when done. The `finally` block ensures cleanup happens even if the request fails, preventing stale entries from blocking future requests for that key.

This pattern is especially impactful during app startup, configuration changes, and screen transitions, when multiple components initialize simultaneously and all request the same foundational data. Without deduplication, an app with 5 components that all need the current user profile makes 5 redundant API calls on every startup. With deduplication, it makes one. The savings compound: fewer connections opened, less battery consumed, less server load generated, and faster data availability for all components.

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

The basic implementation above has a race condition: between checking `inFlightRequests[key]` and storing the new deferred, another coroutine could also find no existing entry and start a second request. Using a `Mutex` to synchronize the check-and-store operation eliminates this race. The mutex is held only for the brief map lookup and insertion — not for the actual network call — so it does not become a bottleneck.

```kotlin
class ThreadSafeDeduplicator {
    private val inFlightRequests = ConcurrentHashMap<String, Deferred<Any>>()
    private val mutex = Mutex()

    @Suppress("UNCHECKED_CAST")
    suspend fun <T> deduplicate(
        key: String,
        block: suspend () -> T,
    ): T = coroutineScope {
        val deferred = mutex.withLock {
            val existing = inFlightRequests[key]
            if (existing != null && existing.isActive) {
                return@withLock existing
            }
            val newDeferred = async(start = CoroutineStart.LAZY) { block() as Any }
            inFlightRequests[key] = newDeferred
            newDeferred
        }

        try {
            deferred.start()
            deferred.await() as T
        } finally {
            mutex.withLock {
                if (inFlightRequests[key] === deferred) {
                    inFlightRequests.remove(key)
                }
            }
        }
    }
}
```

The scope of deduplication matters significantly. Deduplicating by URL alone is too coarse — `/users?page=1` and `/users?page=2` would be considered the same request. Deduplicating by the full URL including query parameters is better but might miss semantically identical requests with different parameter ordering (`?a=1&b=2` vs `?b=2&a=1`). Normalizing the request into a canonical key — sorting parameters, lowercasing the path, stripping trailing slashes — ensures semantically identical requests are correctly deduplicated.

```kotlin
class RequestKeyGenerator {
    fun generateKey(method: String, url: String, params: Map<String, String>): String {
        val normalizedUrl = url.lowercase().trimEnd('/')
        val sortedParams = params.entries
            .sortedBy { it.key }
            .joinToString("&") { "${it.key}=${it.value}" }
        return "$method:$normalizedUrl?$sortedParams"
    }

    fun generateKey(request: Request): String {
        val url = request.url
        val params = url.queryParameterNames.sorted().associateWith { url.queryParameter(it) ?: "" }
        return generateKey(request.method, url.encodedPath, params)
    }
}
```

Deduplication should have a TTL to handle edge cases where a request hangs indefinitely. Without a timeout, a stuck in-flight request blocks all subsequent requests for that key forever. Adding a TTL ensures stale entries are automatically evicted, allowing fresh requests to proceed. A `CompletableDeferred` with a timeout wrapper provides clean cancellation semantics when the TTL expires.

```kotlin
class TimedDeduplicator(private val timeoutMs: Long = 30_000) {
    private val inFlight = ConcurrentHashMap<String, TimedEntry>()
    private val mutex = Mutex()

    data class TimedEntry(val deferred: Deferred<Any>, val startedAt: Long)

    @Suppress("UNCHECKED_CAST")
    suspend fun <T> deduplicate(key: String, block: suspend () -> T): T = coroutineScope {
        val now = System.currentTimeMillis()

        val deferred = mutex.withLock {
            // Evict expired entries
            inFlight.entries.removeAll { now - it.value.startedAt > timeoutMs }

            val existing = inFlight[key]
            if (existing != null && existing.deferred.isActive) {
                return@withLock existing.deferred
            }

            val newDeferred = async(start = CoroutineStart.LAZY) { block() as Any }
            inFlight[key] = TimedEntry(newDeferred, now)
            newDeferred
        }

        try {
            deferred.start()
            withTimeout(timeoutMs) { deferred.await() as T }
        } finally {
            mutex.withLock {
                val entry = inFlight[key]
                if (entry?.deferred === deferred) {
                    inFlight.remove(key)
                }
            }
        }
    }
}
```

#### Common Mistakes

The biggest mistake is forgetting to clean up the in-flight map entry when the request fails. If a request throws an exception and the entry is not removed, all subsequent requests for that key will await a deferred that has already completed exceptionally, receiving the same stale exception instead of making a fresh attempt. Always use a `finally` block for cleanup.

Another mistake is deduplicating write operations. Deduplication is designed for idempotent reads. If two coroutines both POST to create a resource and you deduplicate them, the second caller silently loses its request. Only deduplicate GET requests and other idempotent operations.

A subtle mistake is not handling the case where the deferred is cancelled by the first caller. If caller A starts the request and caller B joins it, then caller A is cancelled, the deferred may be cancelled too — taking down caller B with it. Using `async(start = CoroutineStart.LAZY)` with `SupervisorJob` prevents cancellation propagation between independent callers sharing the same deferred.

**Key takeaway:** Deduplicate concurrent identical requests to prevent redundant API calls. This is especially impactful during app startup when multiple components request the same foundational data. The pattern eliminates thundering herd problems at the client level.

### Lesson 9.5: Circuit Breaker Pattern

The circuit breaker pattern prevents cascading failures by stopping requests to a failing service. When a service is down, continuing to make requests wastes resources and delays the user experience — each request hangs until timeout, then fails. A circuit breaker detects consecutive failures, trips open, and fails fast for subsequent requests without even attempting the network call. After a cooldown period, it allows a single test request through to check if the service has recovered. The name comes from electrical circuit breakers that trip to prevent overcurrent from damaging equipment — the same protective principle applied to software.

The three states form a finite state machine: CLOSED means normal operation where requests flow through and failures are counted. OPEN means the circuit is tripped and all calls fail immediately with a descriptive error, saving the timeout wait. HALF_OPEN means the cooldown period has elapsed and the circuit allows exactly one test request through. If the test request succeeds, the circuit transitions back to CLOSED and resets the failure counter. If the test request fails, the circuit transitions back to OPEN and resets the cooldown timer. This three-state machine provides automatic recovery detection without manual intervention.

In a mobile app, the circuit breaker is especially useful for non-critical services — analytics, recommendations, ads, feature flags. If the analytics service is down, you do not want it blocking the user's ability to browse products. The circuit breaker fails fast on analytics calls, letting the rest of the app function normally while the analytics service recovers in the background. For critical services like authentication or checkout, you might use a circuit breaker with a higher threshold and longer cooldown, combined with a fallback strategy.

```kotlin
class CircuitBreaker(
    private val failureThreshold: Int = 5,
    private val cooldownMs: Long = 30_000,
    private val name: String = "default",
) {
    enum class State { CLOSED, OPEN, HALF_OPEN }

    @Volatile private var state = State.CLOSED
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

    private fun remainingCooldownMs(): Long =
        cooldownMs - (System.currentTimeMillis() - lastFailureTime)

    fun getState(): State = state
}

class CircuitOpenException(message: String) : Exception(message)
```

A thread-safe implementation requires synchronization around state transitions since multiple coroutines may call `execute` concurrently. Using a `Mutex` prevents two coroutines from both transitioning the state from OPEN to HALF_OPEN simultaneously, which would allow two test requests instead of one. The mutex should be held only during state checks and transitions, not during the actual network call execution, to avoid serializing all requests through the circuit breaker.

```kotlin
class ThreadSafeCircuitBreaker(
    private val failureThreshold: Int = 5,
    private val cooldownMs: Long = 30_000,
    private val name: String = "default",
) {
    enum class State { CLOSED, OPEN, HALF_OPEN }

    private var state = State.CLOSED
    private var failureCount = 0
    private var lastFailureTime = 0L
    private val mutex = Mutex()

    suspend fun <T> execute(block: suspend () -> T): T {
        val permitted = mutex.withLock {
            when (state) {
                State.CLOSED -> true
                State.OPEN -> {
                    if (System.currentTimeMillis() - lastFailureTime > cooldownMs) {
                        state = State.HALF_OPEN
                        true
                    } else {
                        false
                    }
                }
                State.HALF_OPEN -> true
            }
        }
        if (!permitted) {
            throw CircuitOpenException("Circuit '$name' is open")
        }

        return try {
            val result = block()
            mutex.withLock { onSuccess() }
            result
        } catch (e: Exception) {
            mutex.withLock { onFailure() }
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
        if (failureCount >= failureThreshold) state = State.OPEN
    }
}
```

A production circuit breaker should use a sliding window for failure rate calculation rather than a simple consecutive failure counter. A counter-based approach trips the circuit after N consecutive failures, but a single success resets the counter — even if 95% of requests are failing. A sliding window tracks the success and failure rate over the last N requests or the last M seconds, tripping the circuit when the failure rate exceeds a threshold. This provides a more accurate picture of service health.

```kotlin
class SlidingWindowCircuitBreaker(
    private val windowSize: Int = 20,
    private val failureRateThreshold: Double = 0.5,
    private val cooldownMs: Long = 30_000,
    private val name: String = "default",
) {
    enum class State { CLOSED, OPEN, HALF_OPEN }

    private var state = State.CLOSED
    private val results = ArrayDeque<Boolean>(windowSize)
    private var lastFailureTime = 0L
    private val mutex = Mutex()

    suspend fun <T> execute(block: suspend () -> T): T {
        val permitted = mutex.withLock { checkPermission() }
        if (!permitted) throw CircuitOpenException("Circuit '$name' is open")

        return try {
            val result = block()
            mutex.withLock { recordResult(success = true) }
            result
        } catch (e: Exception) {
            mutex.withLock { recordResult(success = false) }
            throw e
        }
    }

    private fun checkPermission(): Boolean = when (state) {
        State.CLOSED -> true
        State.OPEN -> {
            if (System.currentTimeMillis() - lastFailureTime > cooldownMs) {
                state = State.HALF_OPEN
                true
            } else false
        }
        State.HALF_OPEN -> true
    }

    private fun recordResult(success: Boolean) {
        if (results.size >= windowSize) results.removeFirst()
        results.addLast(success)

        if (success && state == State.HALF_OPEN) {
            state = State.CLOSED
            return
        }
        if (!success) {
            lastFailureTime = System.currentTimeMillis()
            if (state == State.HALF_OPEN) {
                state = State.OPEN
                return
            }
        }

        if (results.size >= windowSize) {
            val failureRate = results.count { !it }.toDouble() / results.size
            if (failureRate >= failureRateThreshold) state = State.OPEN
        }
    }
}
```

Managing circuit breakers across multiple services requires a registry that creates and retrieves named circuit breakers. Each service (user API, analytics, recommendations, payments) gets its own circuit breaker with independent thresholds and cooldowns. The registry also enables monitoring — you can query the state of all circuit breakers to build a health dashboard that shows which services are healthy, degraded, or down.

```kotlin
object CircuitBreakerRegistry {
    private val breakers = ConcurrentHashMap<String, CircuitBreaker>()

    fun getOrCreate(
        name: String,
        failureThreshold: Int = 5,
        cooldownMs: Long = 30_000,
    ): CircuitBreaker = breakers.getOrPut(name) {
        CircuitBreaker(failureThreshold, cooldownMs, name)
    }

    fun getHealthReport(): Map<String, CircuitBreaker.State> =
        breakers.mapValues { it.value.getState() }

    fun reset(name: String) {
        breakers.remove(name)
    }
}

// Usage — each service gets its own circuit breaker
suspend fun fetchRecommendations(userId: String): List<Product> {
    val breaker = CircuitBreakerRegistry.getOrCreate(
        name = "recommendations",
        failureThreshold = 3,
        cooldownMs = 60_000,
    )
    return breaker.execute { api.getRecommendations(userId) }
}
```

#### Common Mistakes

The most common mistake is using the same circuit breaker for all services. When the analytics service goes down, it trips the shared circuit breaker and blocks requests to the perfectly healthy user API. Each service needs its own independent circuit breaker with thresholds tuned to that service's reliability characteristics.

Another mistake is setting the failure threshold too low. A threshold of 1 or 2 means a single transient error trips the circuit, causing unnecessary service disruption. Set the threshold high enough that genuine outages are detected (5-10 failures) but transient blips are tolerated.

A subtle mistake is not providing a fallback when the circuit is open. Simply throwing a `CircuitOpenException` and showing an error dialog is a poor user experience. For non-critical services, provide cached data, default values, or gracefully hide the affected feature. For critical services, queue the request for retry when the circuit closes.

**Key takeaway:** The circuit breaker fails fast when a service is consistently failing, saving resources and improving user experience. Use it for non-critical services where graceful degradation is acceptable. The three-state machine (closed → open → half-open) provides automatic recovery detection.

### Lesson 9.6: Interceptor Architecture

OkHttp's interceptor chain is a powerful extension point that separates cross-cutting concerns — authentication, logging, caching, metrics, certificate pinning — from business logic. Every OkHttp request passes through an ordered chain of interceptors, each of which can inspect, modify, short-circuit, or retry the request and response. Understanding the distinction between application interceptors and network interceptors is essential for correct implementation. Application interceptors (`addInterceptor`) run once per logical call, see the original request before OkHttp's internal machinery, and are not invoked for cached responses. Network interceptors (`addNetworkInterceptor`) run for every network request including redirects and retries, see the actual on-the-wire request with headers OkHttp added, and have access to the `Connection` object with protocol and TLS information.

Auth token injection belongs in an application interceptor. You want it applied once before any redirects, and you do not want redirect requests hitting a different host with your auth token. If the request is redirected from `api.example.com` to `cdn.example.com`, an application interceptor's token is only added to the original request. A network interceptor would add the token to the redirect request too, potentially leaking credentials to a third-party host.

Logging belongs in a network interceptor because you want to see every hop including redirects, the actual wire timing, and the real request and response headers after OkHttp's internal modifications. Network interceptors see the `Content-Encoding` and `Content-Length` headers as sent on the wire, while application interceptors see the decoded body. For debugging production issues, network-level visibility is essential.

```kotlin
class AuthInterceptor(
    private val tokenManager: TokenManager,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // Skip auth for public endpoints
        if (originalRequest.header("No-Auth") != null) {
            return chain.proceed(
                originalRequest.newBuilder().removeHeader("No-Auth").build()
            )
        }

        val token = tokenManager.getAccessToken()
        val authenticatedRequest = originalRequest.newBuilder()
            .addHeader("Authorization", "Bearer $token")
            .build()

        val response = chain.proceed(authenticatedRequest)

        // Handle 401 — refresh token and retry once
        if (response.code == 401) {
            response.close()

            synchronized(this) {
                val currentToken = tokenManager.getAccessToken()
                if (currentToken == token) {
                    val newToken = tokenManager.refreshToken()
                        ?: throw AuthenticationException("Token refresh failed")
                    tokenManager.saveAccessToken(newToken)
                }
            }

            val newToken = tokenManager.getAccessToken()
            val retryRequest = originalRequest.newBuilder()
                .addHeader("Authorization", "Bearer $newToken")
                .build()
            return chain.proceed(retryRequest)
        }

        return response
    }
}

class AuthenticationException(message: String) : Exception(message)
```

A production auth interceptor must handle token refresh with proper synchronization. When the server returns 401, the interceptor attempts to refresh the access token using the refresh token, then retries the original request with the new token. The `synchronized` block ensures that if 5 requests all receive 401 simultaneously, only one triggers a token refresh. The others wait for the lock, find the token already refreshed, and retry with the new token immediately. Without synchronization, you get 5 concurrent refresh requests, and all but one fail because refresh tokens are single-use.

A logging interceptor at the network level captures the complete request-response lifecycle including timing, headers, and body size. For production, log only metadata (method, URL, status code, duration) — never log request or response bodies, which may contain sensitive data like passwords, tokens, or personal information. Use a configurable log level that can be adjusted per build type: verbose for debug builds, minimal for release builds.

```kotlin
class TimingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val startMs = System.currentTimeMillis()

        val response = chain.proceed(request)

        val durationMs = System.currentTimeMillis() - startMs
        val protocol = chain.connection()?.protocol() ?: Protocol.HTTP_1_1

        Log.d("Network", buildString {
            append("${request.method} ${request.url.encodedPath}")
            append(" → ${response.code}")
            append(" [${durationMs}ms, $protocol]")
            append(" ${response.body?.contentLength() ?: "unknown"} bytes")
        })

        return response
    }
}
```

Certificate pinning is a critical security measure that prevents man-in-the-middle attacks by verifying that the server's TLS certificate matches a known set of public key hashes. Without pinning, any certificate authority (CA) trusted by the device can issue a certificate for your domain, and a compromised CA or a malicious network could intercept all traffic. OkHttp's `CertificatePinner` makes this straightforward to implement. Pin against the public key hash (SPKI) rather than the certificate itself, so you do not need to update pins every time the certificate is renewed. Always include a backup pin for the next certificate in your rotation plan.

```kotlin
val certificatePinner = CertificatePinner.Builder()
    .add(
        "api.example.com",
        "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // Current
        "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=", // Backup
    )
    .build()

val pinnedClient = OkHttpClient.Builder()
    .certificatePinner(certificatePinner)
    .addInterceptor(AuthInterceptor(tokenManager))
    .addNetworkInterceptor(TimingInterceptor())
    .build()
```

The order of interceptors in the chain matters significantly. Application interceptors execute in the order they are added, and each interceptor receives the request modified by the previous one. Auth should come before logging so that the log captures the authenticated request. Error-handling interceptors should come early in the chain so they can catch exceptions from downstream interceptors. The chain follows a stack-like pattern: the first interceptor added is the outermost — it sees the original request first and the final response last.

```kotlin
val client = OkHttpClient.Builder()
    // Application interceptors — run once per call, in order
    .addInterceptor(ErrorMappingInterceptor())    // Outermost: catches all errors
    .addInterceptor(AuthInterceptor(tokenManager)) // Adds auth token
    .addInterceptor(RequestIdInterceptor())        // Adds unique request ID

    // Network interceptors — run per network hop, in order
    .addNetworkInterceptor(TimingInterceptor())    // Logs actual wire timing
    .addNetworkInterceptor(CacheControlInterceptor()) // Modifies cache headers

    .certificatePinner(certificatePinner)
    .build()

class RequestIdInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request().newBuilder()
            .addHeader("X-Request-ID", UUID.randomUUID().toString())
            .build()
        return chain.proceed(request)
    }
}

class ErrorMappingInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        return try {
            chain.proceed(chain.request())
        } catch (e: IOException) {
            throw NetworkException("Network unavailable", e)
        }
    }
}

class NetworkException(message: String, cause: Throwable) : IOException(message, cause)
```

#### Common Mistakes

The most common mistake is adding auth tokens in a network interceptor. This leaks credentials to redirect hosts and fires for every redirect hop, potentially adding your auth token to requests that go to CDNs, analytics endpoints, or third-party services your backend redirects to.

Another mistake is closing the response body in an interceptor without returning a new response. OkHttp response bodies can only be consumed once. If an interceptor reads the body for logging and does not reconstruct it, the caller receives an empty body. Use `peekBody()` for logging or buffer the body and create a new response with the buffered content.

A dangerous mistake is not calling `chain.proceed(request)`. Every interceptor must call `proceed` exactly once (or zero times if short-circuiting). Calling it twice results in duplicate requests. Not calling it at all hangs the request. If you need to retry, close the previous response before calling `proceed` again.

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

The architecture has three data paths. The primary path is WebSocket for live messages — a persistent bidirectional connection that delivers messages with sub-second latency. The fallback path is REST for message history — when the user scrolls up to load older messages or when the app needs to catch up after a reconnection gap. The offline path is the write queue — messages typed while offline are persisted locally and synced when connectivity returns. Each path has its own failure modes: WebSocket connections drop on network transitions, REST calls can timeout during history loads, and queued messages need deduplication when they finally sync.

The data model requires careful thought. Each message has a client-generated UUID (so it can be created offline), a chat ID, the message body, a sender ID, a timestamp, and a status field. The status field drives the UI: SENDING (queued locally, not yet confirmed), SENT (server acknowledged receipt), DELIVERED (recipient's device received it), and READ (recipient viewed it). Status updates flow backward through the WebSocket — the server pushes delivery and read receipts as events. Storing the message entity in Room with an `@Upsert` annotation prevents duplicates when the same message arrives via both the optimistic insert and the WebSocket echo.

The key design decision is optimistic insertion. When the user taps send, the message is immediately inserted into Room with status SENDING. The UI shows it instantly in the chat. The WebSocket send happens asynchronously. If it succeeds, the status updates to SENT. If it fails (offline or error), the message stays in the local database with SENDING status and is queued for retry. The user never waits for the network to see their own message.

WebSocket connection management is one of the trickiest parts of a chat architecture. The connection must survive activity recreation, handle network transitions gracefully, and reconnect with an exponential backoff strategy. When the app comes back online after a disconnection, it needs to perform a "catch-up" — fetching all messages that arrived while the socket was down. This is done by sending the timestamp of the last received message and getting all newer messages via REST. Without this catch-up mechanism, users would miss messages that arrived during the offline window.

```kotlin
class ChatWebSocketManager(
    private val okHttpClient: OkHttpClient,
    private val tokenProvider: TokenProvider,
) {
    private var webSocket: WebSocket? = null
    private val _events = MutableSharedFlow<ChatEvent>(replay = 0)
    val events: SharedFlow<ChatEvent> = _events.asSharedFlow()
    private var retryCount = 0

    fun connect() {
        val request = Request.Builder()
            .url("wss://api.example.com/chat")
            .addHeader("Authorization", "Bearer ${tokenProvider.getToken()}")
            .build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                val event = Json.decodeFromString<ChatEvent>(text)
                _events.tryEmit(event)
                retryCount = 0
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                scheduleReconnect()
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        val delayMs = (1000L * (1 shl retryCount.coerceAtMost(5)))
            .coerceAtMost(30_000L)
        retryCount++
        CoroutineScope(Dispatchers.IO).launch {
            delay(delayMs)
            connect()
        }
    }

    fun disconnect() {
        webSocket?.close(1000, "User disconnected")
        webSocket = null
    }
}
```

Typing indicators add a layer of real-time state that is intentionally ephemeral — you never persist typing status to the database. When a user starts typing, a "typing" event is sent through the WebSocket. The recipient's UI shows "User is typing..." with a timeout that clears the indicator after a few seconds of inactivity. The sender side debounces the typing events so rapid keystrokes do not flood the socket. This is a fire-and-forget pattern where delivery is not guaranteed and that is perfectly acceptable because a missed typing indicator has zero impact on data integrity.

```kotlin
class TypingIndicatorManager(
    private val webSocket: ChatWebSocketManager,
) {
    private val typingJobs = mutableMapOf<String, Job>()
    private var lastTypingSent = 0L

    fun onUserTyping(chatId: String, scope: CoroutineScope) {
        val now = System.currentTimeMillis()
        // Debounce: send at most once every 3 seconds
        if (now - lastTypingSent < 3000) return
        lastTypingSent = now

        webSocket.sendTypingEvent(chatId)
    }

    fun onRemoteUserTyping(userId: String, chatId: String, scope: CoroutineScope,
                           onTyping: (Boolean) -> Unit) {
        typingJobs[userId]?.cancel()
        onTyping(true)

        typingJobs[userId] = scope.launch {
            delay(4000) // Clear after 4 seconds of no typing event
            onTyping(false)
        }
    }
}
```

The message queue handles offline sends with ordering guarantees and deduplication. Messages must be sent in the order they were composed — a user expects message A to appear before message B if they typed A first. The queue processes messages sequentially, waiting for server acknowledgment before sending the next. Each message carries the client-generated UUID, and the server uses this UUID for deduplication. If the server already has a message with that UUID, it returns a success response without creating a duplicate, making the entire send operation idempotent.

```kotlin
class MessageSyncQueue(
    private val queueDao: SyncQueueDao,
    private val webSocket: ChatWebSocketManager,
    private val messageDao: MessageDao,
) {
    suspend fun processQueue() {
        val pendingMessages = queueDao.getPendingMessages()
            .sortedBy { it.createdAt }

        for (queued in pendingMessages) {
            try {
                webSocket.sendAndAwaitAck(queued.toPayload())
                messageDao.updateStatus(queued.messageId, MessageStatus.SENT)
                queueDao.remove(queued.id)
            } catch (e: Exception) {
                // Stop processing — maintain order guarantee
                messageDao.updateStatus(queued.messageId, MessageStatus.FAILED)
                break
            }
        }
    }
}
```

The chat repository ties all these components together. It coordinates between the WebSocket manager, the local database, the message queue, and the REST API for history. The repository exposes a single `Flow` of messages that the UI observes. Whether a message arrives from the WebSocket, from history loading, or from an optimistic insert, it flows through Room and the UI updates automatically. This single source of truth pattern means the UI never has to merge data from multiple streams — it just observes the database.

```kotlin
class ChatRepository(
    private val webSocket: ChatWebSocketManager,
    private val dao: MessageDao,
    private val syncQueue: MessageSyncQueue,
    private val connectivityMonitor: ConnectivityMonitor,
    private val api: ChatApi,
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
        dao.insert(message.toEntity())

        if (connectivityMonitor.state.value.isConnected) {
            try {
                webSocket.sendAndAwaitAck(message.toPayload())
                dao.updateStatus(message.id, MessageStatus.SENT)
            } catch (e: Exception) {
                syncQueue.enqueue(message)
            }
        } else {
            syncQueue.enqueue(message)
        }
    }

    suspend fun loadHistory(chatId: String, beforeMessageId: String) {
        val response = api.getMessages(chatId, before = beforeMessageId, limit = 30)
        dao.insertAll(response.messages.map { it.toEntity() })
    }

    suspend fun catchUpAfterReconnect(chatId: String) {
        val lastMessage = dao.getLatestMessage(chatId)
        val missedMessages = api.getMessagesSince(chatId, since = lastMessage?.timestamp ?: 0)
        dao.upsertAll(missedMessages.map { it.toEntity() })
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

#### Common Mistakes

The most frequent mistake is not handling WebSocket reconnection properly. Developers connect the socket when the screen opens and assume it stays alive. In practice, sockets drop constantly — when the user switches from WiFi to cellular, when the device enters Doze mode, or when the server deploys a new version. Without an exponential backoff reconnection strategy and a catch-up mechanism, users silently miss messages. Always track the timestamp of the last received event and fetch missed messages via REST after reconnection.

Another common mistake is using server-generated message IDs instead of client-generated UUIDs. If the client waits for the server to assign an ID before displaying the message, the user experiences a visible delay on every send. Worse, if the network request to create the message fails, the client has no way to retry without risking duplicates because it cannot distinguish "the server never received it" from "the server received it but the response was lost." Client-generated UUIDs solve both problems — the message is displayed immediately with its final ID, and retries are inherently idempotent.

A third mistake is sending typing indicators on every keystroke. This floods the WebSocket with events and creates visible flickering in the recipient's UI as the typing indicator rapidly toggles on and off. Always debounce typing events — send at most one event every two to three seconds, and clear the indicator on the recipient side after a timeout of four to five seconds. Typing indicators are best-effort and lossy by design.

**Key takeaway:** A chat app combines WebSocket for real-time delivery, REST for history pagination, offline queue for send reliability, and optimistic insertion for instant UI feedback. Message status tracking (sending → sent → delivered → read) drives the UI through Room's reactive queries.

### Lesson 10.2: Design a Social Media Feed

A social media feed is a read-heavy system with specific challenges: massive scroll performance, mixed media types (text, images, video), complex engagement interactions (like, comment, share, bookmark), and real-time-ish updates without the overhead of WebSocket. The architectural decisions differ significantly from a chat app because the data access pattern is different — feeds are append-only, read-heavy, and tolerance for staleness is higher. Users expect buttery smooth scrolling through hundreds of items, which means every millisecond of frame time matters and lazy loading must be carefully orchestrated.

The pagination strategy must be cursor-based, not page-number-based. New posts are constantly being added to the feed. If the user is on page 3 and a new post is added, page-number pagination would shift all items, causing duplicates or skipped posts. Cursor-based pagination anchors to a specific post ID, providing stable results regardless of insertions. The RemoteMediator pattern with Room gives offline pagination — the user can scroll through previously loaded feed items without network, and new pages are fetched and persisted as they scroll. The `maxSize` configuration in `PagingConfig` is critical for memory management — without it, the in-memory list grows unbounded as the user scrolls, eventually causing out-of-memory crashes on long browsing sessions.

```kotlin
class FeedRemoteMediator(
    private val api: FeedApi,
    private val dao: FeedDao,
    private val database: AppDatabase,
) : RemoteMediator<Int, FeedItemEntity>() {

    override suspend fun load(
        loadType: LoadType,
        state: PagingState<Int, FeedItemEntity>,
    ): MediatorResult {
        val cursor = when (loadType) {
            LoadType.REFRESH -> null
            LoadType.PREPEND -> return MediatorResult.Success(endOfPaginationReached = true)
            LoadType.APPEND -> {
                val lastItem = state.lastItemOrNull()
                    ?: return MediatorResult.Success(endOfPaginationReached = true)
                lastItem.id
            }
        }

        return try {
            val response = api.getFeed(cursor = cursor, limit = 20)

            database.withTransaction {
                if (loadType == LoadType.REFRESH) {
                    dao.clearAll()
                }
                dao.insertAll(response.posts.map { it.toEntity() })
            }

            MediatorResult.Success(endOfPaginationReached = response.posts.isEmpty())
        } catch (e: Exception) {
            MediatorResult.Error(e)
        }
    }
}
```

Engagement actions (like, bookmark) use optimistic updates exclusively. When the user taps the like button, the local count increments instantly and the heart animates immediately. The API call happens in the background. If it fails, the like is rolled back. This pattern makes the feed feel responsive even on slow connections. For comments, the approach is similar: the comment appears instantly in the local list with a "sending" indicator, and updates to "sent" when the server confirms. The unlike operation mirrors the like — it decrements the count optimistically and rolls back on failure. Both operations should use a mutex or atomic check to prevent race conditions when the user taps rapidly.

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

    suspend fun toggleLike(postId: String, currentlyLiked: Boolean) {
        if (currentlyLiked) {
            dao.decrementLikeCount(postId)
            dao.setLiked(postId, false)
            try {
                api.unlikePost(postId)
            } catch (e: Exception) {
                dao.incrementLikeCount(postId)
                dao.setLiked(postId, true)
            }
        } else {
            dao.incrementLikeCount(postId)
            dao.setLiked(postId, true)
            try {
                api.likePost(postId)
            } catch (e: Exception) {
                dao.decrementLikeCount(postId)
                dao.setLiked(postId, false)
            }
        }
    }

    suspend fun bookmarkPost(postId: String, currentlyBookmarked: Boolean) {
        dao.setBookmarked(postId, !currentlyBookmarked)
        try {
            if (currentlyBookmarked) api.unbookmarkPost(postId)
            else api.bookmarkPost(postId)
        } catch (e: Exception) {
            dao.setBookmarked(postId, currentlyBookmarked)
        }
    }
}
```

Image loading is a critical performance concern. Use Coil or Glide with aggressive memory and disk caching. Prefetch images for the next page of items before the user scrolls to them. Use appropriate image sizes — request thumbnails for the feed, full-resolution only when the user taps to view. Consider placeholder images with blur hashes (a compact representation of the image's color distribution) that load instantly while the real image downloads. For video posts, never autoplay with audio — autoplay muted videos only when they are at least 50% visible in the viewport, and pause them immediately when they scroll out of view to conserve bandwidth and battery.

```kotlin
class FeedImagePrefetcher(
    private val context: Context,
    private val imageLoader: ImageLoader,
) {
    fun prefetchImages(items: List<FeedItem>) {
        items.forEach { item ->
            when (val content = item.content) {
                is FeedContent.ImagePost -> {
                    content.imageUrls.take(1).forEach { url ->
                        val request = ImageRequest.Builder(context)
                            .data(url)
                            .size(FEED_THUMBNAIL_WIDTH, FEED_THUMBNAIL_HEIGHT)
                            .memoryCachePolicy(CachePolicy.ENABLED)
                            .diskCachePolicy(CachePolicy.ENABLED)
                            .build()
                        imageLoader.enqueue(request)
                    }
                }
                is FeedContent.VideoPost -> {
                    val request = ImageRequest.Builder(context)
                        .data(content.thumbnailUrl)
                        .size(FEED_THUMBNAIL_WIDTH, FEED_THUMBNAIL_HEIGHT)
                        .build()
                    imageLoader.enqueue(request)
                }
                else -> { /* No prefetch needed */ }
            }
        }
    }

    companion object {
        private const val FEED_THUMBNAIL_WIDTH = 1080
        private const val FEED_THUMBNAIL_HEIGHT = 1080
    }
}
```

The data model must support polymorphic content types while keeping the Room entity flat. A sealed interface for `FeedContent` gives type-safe rendering in Compose, but Room cannot store sealed interfaces directly. The solution is a flat entity with a `contentType` discriminator column and nullable fields for each content variant. The mapping layer converts between the flat entity and the rich domain model. This keeps the database simple and the domain model expressive.

```kotlin
sealed interface FeedContent {
    data class TextPost(val text: String) : FeedContent
    data class ImagePost(val text: String?, val imageUrls: List<String>,
                         val blurHashes: List<String>) : FeedContent
    data class VideoPost(val text: String?, val videoUrl: String,
                         val thumbnailUrl: String, val durationMs: Long) : FeedContent
    data class SharedPost(val text: String?, val originalPostId: String) : FeedContent
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

fun FeedItemEntity.toDomain(): FeedItem = FeedItem(
    id = id,
    authorId = authorId,
    authorName = authorName,
    authorAvatarUrl = authorAvatarUrl,
    content = when (contentType) {
        "text" -> FeedContent.TextPost(text = body.orEmpty())
        "image" -> FeedContent.ImagePost(
            text = body,
            imageUrls = imageUrls.orEmpty(),
            blurHashes = blurHashes.orEmpty(),
        )
        "video" -> FeedContent.VideoPost(
            text = body,
            videoUrl = videoUrl.orEmpty(),
            thumbnailUrl = thumbnailUrl.orEmpty(),
            durationMs = durationMs ?: 0L,
        )
        "shared" -> FeedContent.SharedPost(text = body, originalPostId = originalPostId.orEmpty())
        else -> FeedContent.TextPost(text = body.orEmpty())
    },
    likeCount = likeCount,
    commentCount = commentCount,
    isLiked = isLiked,
    isBookmarked = isBookmarked,
    createdAt = createdAt,
)
```

Pull-to-refresh is the primary mechanism for getting new content, supplemented by periodic polling when the app is in the foreground. When the user pulls to refresh, the RemoteMediator performs a `REFRESH` load type, clearing stale data and inserting the latest posts. A subtle but important detail is showing a "new posts available" banner instead of automatically scrolling the user to the top — if the user is reading a post mid-scroll, yanking them to the top is a terrible experience. Let them tap the banner to scroll up when they are ready.

#### Common Mistakes

The most common mistake in feed design is not setting `maxSize` in `PagingConfig`. Without a cap, the loaded pages accumulate in memory as the user scrolls through hundreds of posts. On a device with limited RAM, this causes increasing GC pressure, frame drops, and eventually an `OutOfMemoryError`. Set `maxSize` to roughly ten times `pageSize` — this means the system keeps around 200 items in memory and drops the oldest pages as new ones load.

Another frequent error is performing the like/unlike API call on the main thread or blocking the UI until the server responds. Engagement actions must be fire-and-forget from the user's perspective. The optimistic update happens synchronously in the database, the UI reacts instantly via the `Flow`, and the network call runs in a background coroutine. If developers skip the optimistic update and wait for the server response, the like button feels sluggish — a 200ms delay is noticeable and a 2-second delay on slow networks is unacceptable.

A third mistake is loading full-resolution images in the feed. A 4000x3000 pixel image consumes 48MB of memory when decoded. If five such images are visible simultaneously, that is 240MB — enough to crash most devices. Always request size-appropriate thumbnails from the CDN using URL parameters (for example `?w=1080&q=80`) and reserve full-resolution loading for the detail view where only one image is displayed at a time.

**Key takeaway:** A feed uses cursor-based pagination with RemoteMediator for offline scroll, optimistic updates for engagement actions, and aggressive image caching with prefetching. Tolerance for data staleness is higher than chat, so pull-to-refresh and periodic polling are sufficient — no WebSocket needed.

### Lesson 10.3: Design an E-Commerce App

An e-commerce app presents unique system design challenges: the cart must work offline, checkout must be idempotent to prevent double charges, search must be fast and paginated, inventory accuracy must be balanced against UX (showing "out of stock" after the user added it to cart is frustrating), and the entire purchase flow must handle failures gracefully without losing the user's intent. The stakes are higher than in social or content apps because failures directly cost money — a lost order means lost revenue, and a duplicate order means a customer support nightmare.

The cart is local-first with server sync. Users can add items, change quantities, and remove items entirely offline. The cart is persisted in Room with items, quantities, selected variants (size, color), and applied coupons. When connectivity is available, the cart syncs with the server for price validation and inventory checks. The server cart is authoritative for pricing — the local cart can show estimated prices, but the checkout flow always validates against server-calculated totals to prevent price manipulation. The sync strategy is merge-based: the client sends its local cart state, and the server responds with the authoritative cart that reflects current prices, applied promotions, and inventory availability.

```kotlin
class CartRepository(
    private val cartDao: CartDao,
    private val api: CartApi,
    private val connectivityMonitor: ConnectivityMonitor,
) {
    fun observeCart(): Flow<Cart> = cartDao.observeCartItems()
        .map { items -> Cart(items.map { it.toDomain() }) }

    suspend fun addToCart(product: Product, quantity: Int, variant: ProductVariant?) {
        val existing = cartDao.getItem(product.id, variant?.id)
        if (existing != null) {
            cartDao.updateQuantity(existing.id, existing.quantity + quantity)
        } else {
            cartDao.insert(CartItemEntity(
                productId = product.id,
                name = product.name,
                price = product.price,
                quantity = quantity,
                variantId = variant?.id,
                variantLabel = variant?.label,
                imageUrl = product.thumbnailUrl,
            ))
        }

        if (connectivityMonitor.state.value.isConnected) {
            try { api.addToCart(product.id, quantity, variant?.id) }
            catch (_: Exception) { /* Will sync later */ }
        }
    }

    suspend fun updateQuantity(itemId: String, newQuantity: Int) {
        if (newQuantity <= 0) {
            cartDao.removeItem(itemId)
        } else {
            cartDao.updateQuantity(itemId, newQuantity)
        }
    }

    suspend fun syncCart(): CartSyncResult {
        val localItems = cartDao.getAllItems()
        val serverCart = api.syncCart(localItems.map { it.toSyncRequest() })
        cartDao.replaceAll(serverCart.items.map { it.toEntity() })

        val priceChanges = serverCart.priceChanges
        val unavailable = serverCart.unavailableItems
        return CartSyncResult(priceChanges, unavailable)
    }
}

data class CartSyncResult(
    val priceChanges: List<PriceChange>,
    val unavailableItems: List<String>,
)

data class PriceChange(
    val productId: String,
    val oldPrice: Long,
    val newPrice: Long,
)
```

Checkout is the most critical flow and must handle a specific dangerous scenario: the user taps "Place Order," the network request goes out but the response times out. The server processed the order, but the client doesn't know. The user taps "Place Order" again. Without idempotency protection, they now have two identical orders. The fix is an idempotency key — a UUID generated per checkout attempt. The server stores this key with the order. If the same key arrives again, the server returns the existing order instead of creating a duplicate. The idempotency key must be generated once and reused across retries of the same checkout attempt, but a new key must be generated if the user modifies the cart and tries again.

```kotlin
class CheckoutRepository(
    private val api: CheckoutApi,
    private val cartDao: CartDao,
    private val checkoutStateDao: CheckoutStateDao,
) {
    suspend fun placeOrder(cart: Cart, paymentMethod: PaymentMethod): OrderResult {
        val idempotencyKey = UUID.randomUUID().toString()
        checkoutStateDao.saveCheckoutAttempt(idempotencyKey, cart.toSnapshot())

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
            checkoutStateDao.clearCheckoutAttempt()
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

    suspend fun recoverPendingCheckout(): OrderResult? {
        val pending = checkoutStateDao.getPendingCheckout() ?: return null
        return try {
            val order = api.getOrderByIdempotencyKey(pending.idempotencyKey)
            if (order != null) {
                cartDao.clearCart()
                checkoutStateDao.clearCheckoutAttempt()
                OrderResult.Success(order)
            } else null
        } catch (_: Exception) { null }
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

Search uses a standalone PagingSource (not RemoteMediator, since search results don't need offline persistence). Input is debounced to avoid firing on every keystroke. Recent searches are cached locally for instant repeat searches. Search suggestions come from a separate lightweight API call with aggressive client-side caching. The debounce window should be around 300 milliseconds — short enough to feel responsive but long enough to avoid unnecessary network calls while the user is still typing. Cancellation is equally important: when the user types a new character, the previous search request should be cancelled immediately to prevent stale results from arriving after fresh ones.

```kotlin
class ProductSearchRepository(
    private val api: SearchApi,
    private val recentSearchDao: RecentSearchDao,
) {
    fun searchProducts(query: String): Flow<PagingData<Product>> = Pager(
        config = PagingConfig(pageSize = 20, enablePlaceholders = false),
        pagingSourceFactory = { ProductSearchPagingSource(api, query) },
    ).flow

    suspend fun getSuggestions(query: String): List<String> {
        if (query.length < 2) return emptyList()
        return try {
            api.getSuggestions(query, limit = 8)
        } catch (_: Exception) {
            recentSearchDao.getMatchingSearches("%$query%")
        }
    }

    suspend fun saveRecentSearch(query: String) {
        recentSearchDao.insert(RecentSearchEntity(query = query, timestamp = System.currentTimeMillis()))
        recentSearchDao.trimToLimit(20)
    }

    fun getRecentSearches(): Flow<List<String>> =
        recentSearchDao.observeRecent(limit = 10).map { entities ->
            entities.map { it.query }
        }
}

class ProductSearchPagingSource(
    private val api: SearchApi,
    private val query: String,
) : PagingSource<String, Product>() {

    override suspend fun load(params: LoadParams<String>): LoadResult<String, Product> {
        return try {
            val response = api.search(
                query = query,
                cursor = params.key,
                limit = params.loadSize,
            )
            LoadResult.Page(
                data = response.products,
                prevKey = null,
                nextKey = response.nextCursor,
            )
        } catch (e: Exception) {
            LoadResult.Error(e)
        }
    }

    override fun getRefreshKey(state: PagingState<String, Product>): String? = null
}
```

Inventory display requires a deliberate staleness strategy. Showing exact real-time inventory counts is impractical and unnecessary for most products. Instead, use coarse availability indicators: "In Stock," "Low Stock" (fewer than 5 remaining), and "Out of Stock." Fetch inventory status when the product detail screen loads, and re-validate at checkout time. The product listing page can tolerate stale inventory data from the cache, but the checkout flow must always validate against the server. When inventory becomes unavailable between add-to-cart and checkout, show a clear conflict resolution UI that lets the user remove the unavailable item or choose an alternative rather than silently failing the entire order.

The checkout flow itself should be modeled as a state machine with distinct steps: cart review, shipping address selection, payment method selection, order summary confirmation, and order placement. Each step validates its prerequisites before allowing progression. The state machine prevents the user from reaching the payment step without a valid shipping address, and it prevents the order placement step from firing without confirmed totals. Persisting the checkout state locally means the user can leave and return without losing progress — the app recovers their position in the checkout flow on next launch.

```kotlin
sealed class CheckoutStep {
    data class CartReview(val cart: Cart) : CheckoutStep()
    data class ShippingAddress(val cart: Cart, val addresses: List<Address>) : CheckoutStep()
    data class PaymentMethod(val cart: Cart, val address: Address,
                             val methods: List<PaymentMethod>) : CheckoutStep()
    data class OrderSummary(val cart: Cart, val address: Address,
                            val payment: PaymentMethod, val total: OrderTotal) : CheckoutStep()
    data class Placing(val idempotencyKey: String) : CheckoutStep()
    data class Completed(val order: Order) : CheckoutStep()
    data class Failed(val error: OrderResult, val lastStep: CheckoutStep) : CheckoutStep()
}

class CheckoutStateMachine {
    private val _step = MutableStateFlow<CheckoutStep>(CheckoutStep.CartReview(Cart.empty()))
    val step: StateFlow<CheckoutStep> = _step.asStateFlow()

    fun selectAddress(address: Address) {
        val current = _step.value
        if (current is CheckoutStep.ShippingAddress) {
            _step.value = CheckoutStep.PaymentMethod(
                cart = current.cart,
                address = address,
                methods = emptyList(),
            )
        }
    }

    fun selectPayment(payment: PaymentMethod) {
        val current = _step.value
        if (current is CheckoutStep.PaymentMethod) {
            _step.value = CheckoutStep.OrderSummary(
                cart = current.cart,
                address = current.address,
                payment = payment,
                total = calculateTotal(current.cart),
            )
        }
    }

    fun onOrderFailed(error: OrderResult) {
        val current = _step.value
        _step.value = CheckoutStep.Failed(error = error, lastStep = current)
    }
}
```

#### Common Mistakes

The most dangerous mistake in e-commerce is allowing automatic retries on payment endpoints. If a payment API call times out and the retry interceptor automatically resends it, the user could be charged twice. Payment and order-placement endpoints must be excluded from automatic retry logic. Instead, use an idempotency key and let the user manually retry with a clear "Try Again" button. The idempotency key ensures the server deduplicates the request regardless of how many times it arrives.

Another common mistake is trusting client-side prices. If the client sends the price to the server as part of the order request, a malicious user can modify the request to pay less. The server must always calculate the total from its own product catalog using the product IDs and quantities from the request. The client-displayed price is for UX only — it is never used as the source of truth for billing.

A third mistake is not handling inventory conflicts gracefully at checkout. When a product goes out of stock between the time the user added it to their cart and the time they tap "Place Order," many apps simply show a generic error message. Instead, the server should return a structured 409 response that identifies exactly which items are unavailable and what alternatives exist. The client then shows a targeted conflict resolution UI rather than forcing the user to start the entire checkout process over.

**Key takeaway:** E-commerce apps require local-first carts with server sync for pricing, idempotency keys for checkout to prevent double orders, and careful error handling for inventory conflicts and payment failures. The server is always authoritative for pricing; the client handles optimistic display.

### Lesson 10.4: Design a Media Player App

A media player (music or video streaming) presents system design challenges centered on buffering strategy, download management for offline playback, playlist state management across sessions, and background playback with media session integration. Unlike CRUD apps where data is small, media apps deal with large binary payloads that require streaming, progressive download, and careful memory management. The player must also integrate with the Android media framework — lock screen controls, notification media controls, Bluetooth metadata, and audio focus handling are all required for a production-quality experience.

The buffering strategy has three modes: streaming (play as data arrives, buffer ahead by 30-60 seconds), progressive download (download the file while playing, keeping a larger buffer ahead), and full download (download completely before playing, required for offline). The player should adapt between these modes based on network quality — on fast WiFi, progressive download provides the best experience; on slow cellular, aggressive buffering with lower quality prevents stalling. ExoPlayer (now Media3) handles most of this automatically through its `LoadControl` configuration, but you need to tune the buffer parameters based on your content type. Short-form video needs smaller buffers with faster start times, while long-form music streaming benefits from larger ahead buffers to prevent interruptions.

```kotlin
class AdaptivePlayerFactory {
    fun createPlayer(context: Context, networkType: NetworkType): ExoPlayer {
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ when (networkType) {
                    NetworkType.WIFI -> 15_000
                    NetworkType.CELLULAR -> 30_000
                    NetworkType.OFFLINE -> 0
                },
                /* maxBufferMs = */ when (networkType) {
                    NetworkType.WIFI -> 60_000
                    NetworkType.CELLULAR -> 120_000
                    NetworkType.OFFLINE -> 0
                },
                /* bufferForPlaybackMs = */ 2_500,
                /* bufferForPlaybackAfterRebufferMs = */ 5_000,
            )
            .build()

        return ExoPlayer.Builder(context)
            .setLoadControl(loadControl)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .setUsage(C.USAGE_MEDIA)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .build()
    }
}

enum class NetworkType { WIFI, CELLULAR, OFFLINE }
```

Offline download management requires tracking download state per track (not started, downloading, paused, completed, failed), managing disk space (total downloads can't exceed a configurable limit), and supporting partial downloads that can be resumed after interruption. Downloads use WorkManager for reliability — a download that starts on WiFi continues even if the app is killed, resuming from the last downloaded byte using HTTP Range headers. The download manager must also handle license management for DRM-protected content, where the offline license has an expiration window and must be renewed periodically even when the content itself is already downloaded.

```kotlin
class DownloadManager(
    private val downloadDao: DownloadDao,
    private val storageManager: StorageManager,
) {
    suspend fun downloadTrack(track: Track): Result<Unit> {
        val availableSpace = storageManager.getAvailableBytes()
        val requiredSpace = track.fileSize + STORAGE_BUFFER_BYTES

        if (availableSpace < requiredSpace) {
            return Result.failure(InsufficientStorageException(
                required = requiredSpace,
                available = availableSpace,
            ))
        }

        downloadDao.insert(DownloadEntity(
            trackId = track.id,
            title = track.title,
            url = track.streamUrl,
            status = DownloadStatus.QUEUED,
            totalBytes = track.fileSize,
            downloadedBytes = 0,
        ))

        val request = OneTimeWorkRequestBuilder<MediaDownloadWorker>()
            .setInputData(workDataOf(
                "trackId" to track.id,
                "url" to track.streamUrl,
                "fileSize" to track.fileSize,
            ))
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(androidx.work.NetworkType.UNMETERED)
                    .setRequiresStorageNotLow(true)
                    .build()
            )
            .build()

        WorkManager.getInstance().enqueueUniqueWork(
            "download_${track.id}",
            ExistingWorkPolicy.KEEP,
            request,
        )
        return Result.success(Unit)
    }

    suspend fun removeDownload(trackId: String) {
        val download = downloadDao.getDownload(trackId) ?: return
        download.filePath?.let { File(it).delete() }
        downloadDao.delete(trackId)
    }

    fun observeDownloads(): Flow<List<DownloadState>> =
        downloadDao.observeAll().map { entities ->
            entities.map { it.toDomain() }
        }

    companion object {
        private const val STORAGE_BUFFER_BYTES = 50 * 1024 * 1024L // 50MB buffer
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

The media source resolver determines whether to play from a local file, the streaming cache, or the network. This decision must be transparent to the player — ExoPlayer receives a `MediaSource` regardless of where the data comes from. The resolver checks for a completed offline download first, then checks the streaming cache for recently played content, and finally falls back to network streaming. This layered approach means that a track the user played yesterday might still be in the cache and plays instantly without a network request, even if it was never explicitly downloaded.

```kotlin
class MediaSourceResolver(
    private val downloadDao: DownloadDao,
    private val mediaCache: SimpleCache,
    private val httpDataSourceFactory: DefaultHttpDataSource.Factory,
    private val api: MediaApi,
) {
    fun resolve(trackId: String): MediaSource {
        // Layer 1: Check for completed offline download
        val localFile = downloadDao.getCompletedDownloadSync(trackId)?.filePath
        if (localFile != null) {
            return ProgressiveMediaSource.Factory(FileDataSource.Factory())
                .createMediaSource(MediaItem.fromUri(Uri.parse(localFile)))
        }

        // Layer 2: Stream with cache (recently played tracks may be cached)
        val cacheDataSourceFactory = CacheDataSource.Factory()
            .setCache(mediaCache)
            .setUpstreamDataSourceFactory(httpDataSourceFactory)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)

        val streamUrl = api.getStreamUrlSync(trackId)
        return ProgressiveMediaSource.Factory(cacheDataSourceFactory)
            .createMediaSource(MediaItem.fromUri(streamUrl))
    }
}
```

Playlist and playback state management must survive process death and configuration changes. The current playlist, the index of the currently playing track, the playback position within that track, the shuffle mode, and the repeat mode all need to be persisted. When the user relaunches the app, playback should resume exactly where it left off. This state is persisted in Room (not SharedPreferences, because it includes the full playlist which can be large) and restored when the media service starts. The `MediaSessionService` pattern from Media3 handles the Android media framework integration, but you still need to manage the playlist state yourself.

```kotlin
class PlaybackStateRepository(
    private val dao: PlaybackStateDao,
) {
    suspend fun saveState(player: ExoPlayer) {
        dao.upsert(PlaybackStateEntity(
            id = "current",
            trackId = player.currentMediaItem?.mediaId.orEmpty(),
            positionMs = player.currentPosition,
            playlistJson = Json.encodeToString(
                player.mediaItems().map { it.mediaId }
            ),
            currentIndex = player.currentMediaItemIndex,
            shuffleEnabled = player.shuffleModeEnabled,
            repeatMode = player.repeatMode,
            updatedAt = System.currentTimeMillis(),
        ))
    }

    suspend fun restoreState(player: ExoPlayer, resolver: MediaSourceResolver) {
        val state = dao.getState("current") ?: return
        val trackIds: List<String> = Json.decodeFromString(state.playlistJson)

        val mediaSources = trackIds.map { resolver.resolve(it) }
        player.setMediaSources(mediaSources, state.currentIndex, state.positionMs)
        player.shuffleModeEnabled = state.shuffleEnabled
        player.repeatMode = state.repeatMode
        player.prepare()
    }

    private fun ExoPlayer.mediaItems(): List<MediaItem> {
        return (0 until mediaItemCount).map { getMediaItemAt(it) }
    }
}
```

Audio focus handling is essential for a well-behaved media app. When another app starts playing audio (a phone call, a navigation instruction, a notification sound), your player must respond appropriately — pause for phone calls, duck volume for navigation instructions, and resume after transient interruptions. ExoPlayer handles audio focus automatically when you set `handleAudioFocus = true` in the `AudioAttributes` builder, but you need to understand what happens under the hood to debug issues. The player requests audio focus before playing and releases it when pausing. If focus is lost transiently (a notification sound), playback pauses and resumes automatically. If focus is lost permanently (another music app starts), playback stops and does not resume.

#### Common Mistakes

The most common mistake is not configuring the streaming cache with a maximum size. Without a size limit, the cache grows unbounded as the user plays different tracks, eventually consuming all available disk space. Always set an `LeastRecentlyUsedCacheEvictor` with a reasonable size limit — 100MB to 500MB depending on your app's target audience. The evictor automatically removes the least recently played content when the cache exceeds its limit.

Another frequent mistake is not handling the download-to-stream transition gracefully. If a user starts downloading a track and then taps play before the download is complete, many implementations either block playback until the download finishes or stream a separate copy from the network. The correct approach is to play from the partially downloaded file while the download continues — ExoPlayer's cache system supports this natively if both the download and the player share the same `SimpleCache` instance.

A third mistake is persisting playback state too infrequently. If the app only saves state when the user explicitly pauses, a force-kill or crash loses the user's position in a two-hour podcast. Save playback state periodically — every 10 to 15 seconds during active playback — using a coroutine timer that writes to Room. This ensures the user never loses more than a few seconds of position when the app is unexpectedly killed.

**Key takeaway:** Media player design centers on buffering strategy (stream, progressive, full download), offline download management with WorkManager for reliability, and adaptive quality based on network conditions. Always check for offline downloads before streaming, and use ExoPlayer's cache for recently played content.

### Lesson 10.5: Design a Maps and Navigation App

A maps application is one of the most complex mobile system designs because it combines real-time location tracking, tile-based map rendering, route calculation with turn-by-turn navigation, offline map support, and points of interest (POI) search. The architectural challenge is managing the interplay between continuous location updates, map tile caching, and route state — all while keeping the UI responsive and battery consumption reasonable. Maps also have a uniquely spatial data model where every query is bounded by geographic coordinates, making traditional database indexing patterns insufficient.

Map tile management follows a multi-level cache strategy. The map is divided into tiles at different zoom levels. Tiles are fetched from the network and cached aggressively in a disk cache because map tiles change infrequently. The cache key is (zoom level, x tile coordinate, y tile coordinate). Prefetching loads tiles adjacent to the current viewport so panning feels instant. For offline maps, the user selects a region and the app downloads all tiles at multiple zoom levels for that area — this can be hundreds of megabytes for a city. The tile cache must use an LRU eviction policy with a generous size limit because map tiles are small individually (typically 10-50KB each) but accumulate to gigabytes over time as the user explores different areas.

```kotlin
class TileCacheManager(
    private val diskCache: DiskLruCache,
    private val tileApi: TileApi,
) {
    private val memoryCache = LruCache<TileKey, Bitmap>(MEMORY_CACHE_SIZE)

    suspend fun getTile(zoom: Int, x: Int, y: Int): Bitmap {
        val key = TileKey(zoom, x, y)

        // Layer 1: Memory cache
        memoryCache.get(key)?.let { return it }

        // Layer 2: Disk cache
        val diskEntry = diskCache.get(key.toCacheKey())
        if (diskEntry != null) {
            val bitmap = BitmapFactory.decodeStream(diskEntry.getInputStream(0))
            memoryCache.put(key, bitmap)
            return bitmap
        }

        // Layer 3: Network fetch
        val tileBytes = tileApi.fetchTile(zoom, x, y)
        val bitmap = BitmapFactory.decodeByteArray(tileBytes, 0, tileBytes.size)
        memoryCache.put(key, bitmap)
        saveToDisk(key, tileBytes)
        return bitmap
    }

    fun prefetchAdjacentTiles(zoom: Int, centerX: Int, centerY: Int, scope: CoroutineScope) {
        val adjacentOffsets = listOf(-1, 0, 1)
        scope.launch(Dispatchers.IO) {
            for (dx in adjacentOffsets) {
                for (dy in adjacentOffsets) {
                    if (dx == 0 && dy == 0) continue
                    launch { getTile(zoom, centerX + dx, centerY + dy) }
                }
            }
        }
    }

    private fun saveToDisk(key: TileKey, bytes: ByteArray) {
        val editor = diskCache.edit(key.toCacheKey()) ?: return
        editor.newOutputStream(0).use { it.write(bytes) }
        editor.commit()
    }

    companion object {
        private const val MEMORY_CACHE_SIZE = 100
    }
}

data class TileKey(val zoom: Int, val x: Int, val y: Int) {
    fun toCacheKey(): String = "${zoom}_${x}_$y"
}
```

Location tracking must balance accuracy with battery consumption. GPS provides the most accurate location but drains battery quickly. Network-based location is less accurate but much more power-efficient. The app should use high-accuracy mode during active navigation (GPS with frequent updates) and switch to low-power mode when the user is just browsing the map. The `FusedLocationProviderClient` handles this automatically based on the priority you set, but you still need to manage the lifecycle — stop updates when the app is backgrounded (unless actively navigating), use passive updates to opportunistically get location from other apps' requests, and degrade gracefully when location permission is denied.

```kotlin
class LocationTracker(
    private val fusedLocationClient: FusedLocationProviderClient,
) {
    private val _location = MutableStateFlow<LatLng?>(null)
    val location: StateFlow<LatLng?> = _location.asStateFlow()

    private var locationCallback: LocationCallback? = null

    fun startTracking(priority: LocationPriority, intervalMs: Long): Flow<LatLng> = callbackFlow {
        val request = LocationRequest.Builder(
            when (priority) {
                LocationPriority.HIGH_ACCURACY -> Priority.PRIORITY_HIGH_ACCURACY
                LocationPriority.BALANCED -> Priority.PRIORITY_BALANCED_POWER_ACCURACY
                LocationPriority.LOW_POWER -> Priority.PRIORITY_LOW_POWER
            },
            intervalMs,
        ).setMinUpdateDistanceMeters(
            when (priority) {
                LocationPriority.HIGH_ACCURACY -> 5f
                LocationPriority.BALANCED -> 50f
                LocationPriority.LOW_POWER -> 200f
            }
        ).build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { location ->
                    val latLng = LatLng(location.latitude, location.longitude)
                    _location.value = latLng
                    trySend(latLng)
                }
            }
        }

        fusedLocationClient.requestLocationUpdates(
            request, locationCallback!!, Looper.getMainLooper()
        )

        awaitClose { stopTracking() }
    }

    fun stopTracking() {
        locationCallback?.let { fusedLocationClient.removeLocationUpdates(it) }
        locationCallback = null
    }

    suspend fun getLastKnownLocation(): LatLng? {
        return fusedLocationClient.lastLocation.await()?.let {
            LatLng(it.latitude, it.longitude)
        }
    }
}

enum class LocationPriority { HIGH_ACCURACY, BALANCED, LOW_POWER }
```

Route calculation and turn-by-turn navigation require maintaining a navigation state machine that tracks: current position on the route, distance and time to next maneuver, ETA to destination, whether the user has deviated from the route (requiring re-routing), and upcoming road alerts. The state machine receives location updates and route data as inputs and emits navigation instructions as outputs. Re-routing should be triggered when the user is more than a configurable distance (usually 50-100 meters) from the nearest point on the planned route. The navigation state machine must also handle edge cases like U-turns, arriving at the destination, and the user manually selecting a different route mid-navigation.

```kotlin
class NavigationEngine(
    private val routeApi: RouteApi,
    private val locationTracker: LocationTracker,
) {
    private val _navigationState = MutableStateFlow<NavigationState>(NavigationState.Idle)
    val navigationState: StateFlow<NavigationState> = _navigationState.asStateFlow()

    suspend fun startNavigation(destination: LatLng) {
        val currentLocation = locationTracker.getLastKnownLocation()
            ?: throw LocationUnavailableException()

        val route = routeApi.getRoute(origin = currentLocation, destination = destination)

        _navigationState.value = NavigationState.Navigating(
            route = route,
            currentStepIndex = 0,
            distanceToNextManeuver = route.steps.first().distanceMeters,
            etaSeconds = route.totalDurationSeconds,
        )

        locationTracker.startTracking(
            priority = LocationPriority.HIGH_ACCURACY,
            intervalMs = 1000,
        ).collect { location -> updateNavigation(location, route) }
    }

    private suspend fun updateNavigation(location: LatLng, route: Route) {
        val currentState = _navigationState.value as? NavigationState.Navigating ?: return

        val nearestPoint = findNearestPointOnRoute(location, route)
        val distanceFromRoute = location.distanceTo(nearestPoint)

        if (distanceFromRoute > REROUTE_THRESHOLD_METERS) {
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
            val updatedStep = findCurrentStep(location, route)
            val remainingDistance = calculateRemainingDistance(location, route)

            if (remainingDistance < ARRIVAL_THRESHOLD_METERS) {
                _navigationState.value = NavigationState.Arrived
                locationTracker.stopTracking()
                return
            }

            _navigationState.value = currentState.copy(
                currentStepIndex = updatedStep.index,
                distanceToNextManeuver = updatedStep.distanceToEnd,
                etaSeconds = calculateEta(location, route),
            )
        }
    }

    fun stopNavigation() {
        _navigationState.value = NavigationState.Idle
        locationTracker.stopTracking()
    }

    companion object {
        private const val REROUTE_THRESHOLD_METERS = 75.0
        private const val ARRIVAL_THRESHOLD_METERS = 30.0
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

Geofencing enables location-triggered actions without continuous GPS tracking. Instead of polling the user's location every second, you register geographic regions with the system, and Android notifies your app when the user enters or exits a region. This is dramatically more battery-efficient than continuous tracking. Common use cases include reminding the user about a task when they arrive at a specific location, sending a notification when they are near a point of interest, or automatically switching navigation modes when they enter a parking garage. The geofence API has a limit of 100 active geofences per app, so you need to dynamically manage which geofences are registered based on the user's current area.

```kotlin
class GeofenceManager(
    private val geofencingClient: GeofencingClient,
    private val pendingIntentFactory: GeofencePendingIntentFactory,
) {
    fun registerGeofences(pois: List<PointOfInterest>) {
        val geofences = pois.take(MAX_GEOFENCES).map { poi ->
            Geofence.Builder()
                .setRequestId(poi.id)
                .setCircularRegion(poi.latitude, poi.longitude, poi.radiusMeters)
                .setExpirationDuration(Geofence.NEVER_EXPIRE)
                .setTransitionTypes(
                    Geofence.GEOFENCE_TRANSITION_ENTER or
                    Geofence.GEOFENCE_TRANSITION_EXIT
                )
                .build()
        }

        val request = GeofencingRequest.Builder()
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofences(geofences)
            .build()

        geofencingClient.addGeofences(request, pendingIntentFactory.create())
    }

    fun updateGeofencesForRegion(
        center: LatLng,
        radiusKm: Double,
        allPois: List<PointOfInterest>,
    ) {
        geofencingClient.removeGeofences(pendingIntentFactory.create())

        val nearbyPois = allPois.filter { poi ->
            center.distanceTo(LatLng(poi.latitude, poi.longitude)) < radiusKm * 1000
        }
        registerGeofences(nearbyPois)
    }

    companion object {
        private const val MAX_GEOFENCES = 100
    }
}

data class PointOfInterest(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radiusMeters: Float,
    val category: String,
)
```

Offline maps require bulk downloading of tiles for a user-selected region. The download is a long-running operation that must survive app kills, so it uses WorkManager with progress reporting. The user selects a bounding box on the map and a range of zoom levels to download. The app calculates the total number of tiles required, estimates the download size, and asks the user to confirm before starting. During the download, progress is reported through the WorkManager's `setProgress` API, which the UI observes to show a progress bar. The downloaded region is stored in a metadata table so the app knows which areas are available offline and can show an appropriate indicator on the map.

#### Common Mistakes

The most common mistake in maps apps is requesting high-accuracy location updates continuously, even when the user is just browsing the map without navigating. GPS at one-second intervals drains the battery by 5-10% per hour. Switch to `PRIORITY_BALANCED_POWER_ACCURACY` or `PRIORITY_LOW_POWER` when the user is idle, and only escalate to `PRIORITY_HIGH_ACCURACY` during active navigation. Use `setMinUpdateDistanceMeters` to prevent location callbacks when the user has not moved meaningfully.

Another frequent mistake is not implementing tile prefetching. When the user pans the map, tiles outside the current viewport need to load. Without prefetching, every pan reveals gray placeholder tiles that fill in over several hundred milliseconds, creating a visually jarring experience. Prefetch one ring of tiles around the current viewport so that small panning movements feel instant. For zoom level changes, prefetch tiles at the adjacent zoom levels as well.

A third mistake is not debouncing re-routing during navigation. If the GPS signal is noisy (common in urban canyons between tall buildings), the user's reported position can briefly jump 100 meters from the route and then snap back. Without debouncing, this triggers an unnecessary re-route request on every GPS jitter. Require the user to be off-route for at least three consecutive location updates before triggering a re-route, which filters out GPS noise while still catching genuine deviations within a few seconds.

**Key takeaway:** Maps apps combine tile caching (multi-level disk cache with prefetching), adaptive location tracking (high accuracy during navigation, low power otherwise), and navigation state machines (position tracking, deviation detection, re-routing). Offline maps require bulk tile downloads for selected regions.

### Lesson 10.6: Putting It All Together — The Pattern Catalog

Every real-world system design is a combination of the patterns covered in this course. No single pattern solves everything. The art of system design is knowing which patterns to combine for your specific use case, and making deliberate tradeoff decisions rather than defaulting to the most complex solution. The pattern catalog is a decision framework — given a set of feature requirements, it tells you which architectural patterns to reach for and which to avoid. In interviews, this systematic mapping is what separates a senior engineer from someone who just knows the theory.

The first decision axis is the data access pattern: is the feature read-heavy or write-heavy? Read-heavy features like feeds, product catalogs, and article lists benefit from aggressive caching with the three-layer cache strategy (memory, disk, network) and cursor-based pagination. Write-heavy features like chat, collaborative editing, and form submissions need optimistic updates, offline write queues, and conflict resolution strategies. Most features are a mix, but understanding which direction the feature leans determines which patterns get priority in your architecture.

```kotlin
enum class DataAccessPattern { READ_HEAVY, WRITE_HEAVY, BALANCED }

fun determineDataAccessPattern(
    readFrequency: RequestFrequency,
    writeFrequency: RequestFrequency,
): DataAccessPattern = when {
    readFrequency == RequestFrequency.HIGH &&
        writeFrequency == RequestFrequency.LOW -> DataAccessPattern.READ_HEAVY
    writeFrequency == RequestFrequency.HIGH &&
        readFrequency == RequestFrequency.LOW -> DataAccessPattern.WRITE_HEAVY
    else -> DataAccessPattern.BALANCED
}

enum class RequestFrequency { LOW, MEDIUM, HIGH }

fun recommendReadPatterns(pattern: DataAccessPattern): List<String> = when (pattern) {
    DataAccessPattern.READ_HEAVY -> listOf(
        "Three-layer cache (memory → disk → network)",
        "Cursor-based pagination with RemoteMediator",
        "Aggressive prefetching and cache warming",
        "Stale-while-revalidate for fast initial loads",
    )
    DataAccessPattern.WRITE_HEAVY -> listOf(
        "Optimistic updates with rollback",
        "Offline write queue with ordering guarantees",
        "Conflict resolution (LWW or merge)",
        "Room SSOT with reactive Flow observation",
    )
    DataAccessPattern.BALANCED -> listOf(
        "Room SSOT with NetworkBoundResource",
        "Optimistic updates for user actions",
        "Moderate caching with TTL-based invalidation",
        "Pull-based sync with delta updates",
    )
}
```

The second decision axis is connectivity tolerance. Some features must work fully offline (notes, cart, downloaded content), some need graceful degradation (feed shows cached items but cannot load new ones), and some are inherently online-only (search, live video, payment processing). For fully offline features, you need the complete offline-first stack: Room as the single source of truth, NetworkBoundResource for the read path, an offline write queue for the write path, and a sync strategy for reconciliation when connectivity returns. For graceful degradation, you cache the most recent data and show it with a staleness indicator. For online-only features, you need clear error states and retry mechanisms but no local persistence.

```kotlin
sealed class ConnectivityRequirement {
    data object FullyOffline : ConnectivityRequirement()
    data object GracefulDegradation : ConnectivityRequirement()
    data object OnlineOnly : ConnectivityRequirement()
}

fun recommendConnectivityPatterns(
    requirement: ConnectivityRequirement,
): List<String> = when (requirement) {
    ConnectivityRequirement.FullyOffline -> listOf(
        "Room as single source of truth",
        "NetworkBoundResource for read path",
        "Offline write queue for write path",
        "WorkManager for background sync",
        "Conflict resolution strategy",
    )
    ConnectivityRequirement.GracefulDegradation -> listOf(
        "Room cache with TTL-based staleness",
        "Show cached data with freshness indicator",
        "Pull-to-refresh for manual sync",
        "ConnectivityMonitor for adaptive behavior",
    )
    ConnectivityRequirement.OnlineOnly -> listOf(
        "Retry with exponential backoff and jitter",
        "Circuit breaker for failing endpoints",
        "Clear error states with retry action",
        "Request deduplication for concurrent calls",
    )
}
```

The third decision axis is data freshness. Real-time features (chat, live scores, collaborative editing) need WebSocket or Server-Sent Events with the database as a write-through cache — events flow from the server push channel to Room, and the UI observes Room. Near-real-time features (social feed, notifications) use periodic polling or pull-to-refresh, typically refreshing every 30-60 seconds in the foreground. Eventually consistent features (settings sync, analytics, logs) can use WorkManager for periodic background sync with windows measured in minutes or hours. The key insight is that most features do not need real-time updates even if stakeholders initially ask for them — polling every 30 seconds is indistinguishable from real-time for most content feeds.

```kotlin
sealed class FreshnessRequirement {
    data object RealTime : FreshnessRequirement()
    data class NearRealTime(val intervalSeconds: Long) : FreshnessRequirement()
    data class EventuallyConsistent(val intervalMinutes: Long) : FreshnessRequirement()
}

fun recommendFreshnessPatterns(
    requirement: FreshnessRequirement,
): List<String> = when (requirement) {
    FreshnessRequirement.RealTime -> listOf(
        "WebSocket with write-through Room cache",
        "Event deduplication by server-assigned ID",
        "Reconnection with catch-up via REST",
        "Typing indicators and presence (fire-and-forget)",
    )
    is FreshnessRequirement.NearRealTime -> listOf(
        "Pull-to-refresh with periodic polling",
        "Stale-while-revalidate cache strategy",
        "Conditional requests with ETag/Last-Modified",
        "New content banner (don't auto-scroll)",
    )
    is FreshnessRequirement.EventuallyConsistent -> listOf(
        "WorkManager periodic sync",
        "Delta sync with server timestamps",
        "Last Write Wins conflict resolution",
        "Batch operations for efficiency",
    )
}
```

For any feature that involves critical mutations — payments, order placement, account deletion — the pattern set is fundamentally different from regular CRUD operations. Critical mutations must never be retried automatically because a retry could mean a duplicate charge. They must use idempotency keys so the server can deduplicate requests that arrive multiple times. They must disable optimistic updates because showing "Order Placed" before the server confirms is dangerous. And they must provide clear, actionable error states that distinguish between "the request failed and nothing happened" (safe to retry) and "the request might have succeeded but we lost the response" (check order history before retrying).

For any list that is too long to fetch in one call, use Paging 3 with RemoteMediator for offline pagination or a standalone PagingSource for network-only pagination. For any data that is read frequently, use the three-layer cache (memory → disk → network) with appropriate TTL for each layer. For large apps with multiple teams, use feature-based modularization with dependency inversion through contract interfaces. For API surfaces consumed by other teams or modules, use value classes, sealed interfaces, and default parameters for type safety and evolution. For networking, use a single shared OkHttpClient with per-use-case variants, exponential backoff with jitter for retries, and circuit breakers for non-critical services.

```kotlin
data class PatternCatalog(
    val featureType: String,
    val patterns: List<String>,
    val keyConsideration: String,
)

val catalog = listOf(
    PatternCatalog(
        "Offline-first list (feed, messages, orders)",
        listOf("Room SSOT", "NetworkBoundResource", "Paging 3 + RemoteMediator",
            "Cursor pagination", "Three-layer cache"),
        "Cache invalidation and sync frequency",
    ),
    PatternCatalog(
        "Real-time feature (chat, live scores)",
        listOf("WebSocket", "Room write-through cache", "Event deduplication",
            "Offline write queue", "Optimistic updates"),
        "Connection lifecycle and reconnection catch-up",
    ),
    PatternCatalog(
        "Search",
        listOf("Standalone PagingSource", "Debounced input", "Network-only",
            "Recent searches cache", "Request deduplication"),
        "Debounce timing and query cancellation",
    ),
    PatternCatalog(
        "Critical mutation (payment, order)",
        listOf("Idempotency keys", "No automatic retry", "Server-confirmed UI",
            "Retry with user confirmation"),
        "Never queue payments — fail fast with clear error",
    ),
    PatternCatalog(
        "Multi-device sync (notes, settings)",
        listOf("Pull-based delta sync", "Last Write Wins", "WorkManager periodic",
            "Server timestamps"),
        "Conflict resolution strategy and sync frequency",
    ),
    PatternCatalog(
        "Media playback",
        listOf("Progressive download", "ExoPlayer cache", "WorkManager downloads",
            "Adaptive bitrate", "Background MediaSession"),
        "Buffering strategy and offline download management",
    ),
)
```

In interviews, the pattern catalog becomes your cheat sheet. When the interviewer says "design a food delivery app," you mentally map each feature: restaurant list (offline-first list with cursor pagination), search (standalone PagingSource with debouncing), cart (local-first with server sync), order tracking (SSE or polling for real-time updates), checkout (critical mutation with idempotency key), and order history (RemoteMediator with offline access). This systematic mapping demonstrates that you can decompose any problem into well-understood patterns. The interviewer is not looking for you to invent novel solutions — they want to see that you recognize which battle-tested patterns solve each sub-problem and that you understand the tradeoffs.

The most important skill is not knowing any individual pattern — it is recognizing which combination of patterns solves a specific problem with the right tradeoffs for your constraints. Every design decision has a cost. Adding offline support adds complexity in sync and conflict resolution. Adding real-time updates adds WebSocket lifecycle management. Adding pagination adds cursor tracking and cache invalidation complexity. The best engineers do not build perfect systems — they build systems with the right set of imperfections for their specific context, and they can articulate why they chose each tradeoff.

#### Common Mistakes

The most common mistake in system design interviews is over-engineering. Candidates add WebSocket to every feature, implement CRDT-based conflict resolution for simple settings sync, or build a custom pagination framework when Paging 3 handles the use case perfectly. Start with the simplest pattern that satisfies the requirements and only add complexity when a specific constraint demands it. If the interviewer asks about real-time updates for a product catalog, the correct answer is usually "polling every 60 seconds" — not "WebSocket with event sourcing."

Another frequent mistake is treating all mutations the same. Liking a post and placing an order are both write operations, but they require fundamentally different patterns. Likes use optimistic updates with rollback because a failed like has minimal consequences. Orders use idempotency keys with server-confirmed UI because a failed order could mean a duplicate charge. In your interview, explicitly call out why you are choosing different patterns for different mutation types — this demonstrates nuanced understanding.

A third mistake is not discussing the tradeoffs of your chosen patterns. Every pattern has costs. Offline-first means you need sync and conflict resolution. Optimistic updates mean you need rollback logic and can show temporarily incorrect data. Cursor pagination means you cannot jump to arbitrary pages. When you present your design, proactively mention what you are giving up with each pattern choice. This shows the interviewer that you understand the full picture, not just the happy path.

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
