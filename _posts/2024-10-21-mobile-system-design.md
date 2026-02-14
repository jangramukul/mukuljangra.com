---
title: Mobile System Design Guide
layout: post
categories: post
tags:
  - Android
---

Picture this: you walk into a system design interview, sit down, and the interviewer says "Design a chat app." Your brain immediately starts racing through databases, WebSocket connections, caching layers... and 40 minutes later you realize you spent the first 6 minutes talking about your career history and never actually got to the good stuff.

I've been on both sides of mobile system design interviews — as the nervous candidate and as the person across the table — and here's the honest truth: most people don't fail because they lack technical knowledge. They fail because they don't structure their approach. It's like trying to build a house by starting with the curtains. You need a blueprint first — requirements, architecture decisions, data modeling, API contracts — and you need to lay them out in the right order.

So keep your intro short. Something like: "I'm X, working on Android applications and libraries since 2020. For the past 2 years, I've been leading a team building a messaging product." Done. You've got 40–45 minutes total, and every minute you spend on your life story is a minute stolen from actual design work.

## How to Approach the Interview

Here's the thing about mobile system design interviews — they're not testing whether you've memorized architecture patterns. They're testing your **thought process**. Think of it like a cooking show: the judges don't just taste the final dish. They watch how you handle the ingredients, how you react when something burns, how you make decisions under pressure. The interviewer wants to see how you break down ambiguity, make decisions under constraints, and communicate tradeoffs.

I'd split the 40–45 minutes roughly like this: 5 minutes for requirements gathering, 15–20 minutes for high-level design, and 15–20 minutes for the deep dive into low-level design.

**Communication matters more than most people think.** Talk through your reasoning out loud. Don't just say "I'd use WebSocket here" — explain why. "We need real-time message delivery with low latency, so HTTP polling would waste bandwidth and introduce delay. WebSocket gives us a persistent bidirectional connection, which fits this use case." That's what separates a senior candidate from a mid-level one.

The biggest mistakes I see? Jumping straight into low-level details without establishing requirements, designing in silence for minutes at a time, and trying to cover everything instead of going deep on the things that matter.

## Requirements Gathering

After the introduction, start with requirements gathering by asking questions. But be careful — don't ask for solutions. Ask for **constraints** and then propose solutions yourself. If you say "Should I use MVVM or MVI?" you just handed the interviewer your steering wheel. Take it back. Say "Given the real-time requirements, I'd go with MVI because..." — now *you're* driving. Information gathering breaks down into four areas: functional requirements, non-functional requirements, out-of-scope items, and resource constraints.

### Functional Requirements

These are the features directly visible to the user — the stuff they'd list in an app store review. Say you're designing a messaging app — your functional requirements might look like:

- User can scroll through a conversation list
- User can send and receive text messages in real-time
- User can send attachments and photos
- User can delete or edit a sent message
- User sees read receipts and typing indicators

Now compare that to a food delivery app, where functional requirements shift entirely:

- User can browse restaurants by location and cuisine
- User can add items to cart and customize orders
- User can track delivery in real-time on a map
- User can rate and review past orders

Why does this matter? Because **functional requirements drive your entire architecture**. A messaging app with real-time sync needs a fundamentally different networking layer than a food delivery app that mostly does request-response with occasional location updates. It's like comparing the plumbing in a car wash (constant water flow) vs a regular house (on-demand taps). Same concept — water delivery — but wildly different systems.

### Non-Functional Requirements

These are the qualities that make the app reliable and performant. Users never ask for these directly, but they feel the absence of them immediately — the way you never think about oxygen until there isn't enough:

- **Offline support** — Can the user do anything without internet?
- **Real-time sync** — How fresh does the data need to be?
- **Low latency** — Is sub-second response time critical?
- **Battery optimization** — Are we running background services?
- **Scalability** — How does the client handle 10K messages vs 100K messages?

### Resource Constraints

Don't skip these. Ask about team size — building for a 3-person team vs a 50-person team changes whether you modularize aggressively or keep things simple. Ask about target regions — if you're targeting areas with spotty internet like rural India, you need an **offline-first architecture** with minimal API calls. Ask about user volume — millions of concurrent users means your API pagination and caching strategy become critical.

> **🧠 Think about it:** If your app targets rural areas where users might go minutes without connectivity, how would that change your architecture compared to an app targeting downtown Tokyo with 5G everywhere?

## High-Level Architecture

Before jumping in, I always ask the interviewer: "Should I start with the high-level design?" This signals structure in your thinking. High-level design is about the big picture — modules, their responsibilities, and how they communicate. Think of it as the floor plan of a building before anyone picks out the tile for the bathroom.

![System Design Overview](/static/post-image/system-design-img1.png)

### Client Architecture

For the client side, I almost always reach for **MVI (Model-View-Intent)** these days. MVVM with LiveData was the standard for years, and it works fine, but MVI gives you unidirectional data flow, which makes state management predictable and debugging much easier.

Here's how it works: the View emits intents (user actions), the ViewModel processes them through a reducer, and a single state object drives the UI. It's like a one-way street — data only flows in one direction, so you always know where a bug came from. In a messaging app, your state might look like this:

```kotlin
data class ChatScreenState(
    val messages: List<MessageItem> = emptyList(),
    val isLoading: Boolean = false,
    val error: ErrorType? = null,
    val isUserTyping: Boolean = false,
    val hasMoreMessages: Boolean = true
)

sealed interface ChatIntent {
    data class SendMessage(val text: String) : ChatIntent
    data class LoadMore(val beforeMessageId: String) : ChatIntent
    data class DeleteMessage(val messageId: String) : ChatIntent
    data object RetryConnection : ChatIntent
}
```

The reason I prefer this over exposing multiple LiveData or StateFlow streams is simple — with a single state object, you never end up with inconsistent UI where the loading spinner is showing but the error message is also visible. One state, one truth. Imagine if your GPS showed two different locations simultaneously — that's what multiple independent state streams can do to your UI.

### Networking Layer

Your choice of client-server communication depends entirely on the use case. **REST over HTTPS** works for most request-response patterns — fetching a restaurant list, placing an order, updating a profile. Think of it like sending letters: you write a request, send it, and wait for a reply.

**WebSocket** is the right call when you need persistent bidirectional communication — chat messages, typing indicators, live location tracking. This is more like a phone call: you open a line, and both sides can talk whenever they want.

**Server-Sent Events (SSE)** fits when the server needs to push updates but the client doesn't need to send data back frequently — think notification feeds or live score updates. It's like a radio broadcast: one-way, but always on.

HTTP polling is almost never the right answer for mobile — it wastes battery, bandwidth, and server resources. It's like checking your mailbox every 30 seconds. Just... don't.

### Caching Strategy

IMO this is where most candidates fall short. You need to articulate a clear caching strategy, not just say "I'll use Room." Think about it in layers — like a closet system. Your **network cache** (OkHttp's built-in cache with Cache-Control headers) is the shelf right by the door for things you grab constantly. Your **database cache** (Room for structured data that needs to survive process death) is the dresser — organized, persistent, reliable. Your **in-memory cache** (a simple LRU map for things like user profiles accessed frequently within a session) is your pocket — fast access, limited capacity, gone when you leave.

The real question is always: what's your **source of truth**? For an offline-first app, the local database is your source of truth, and the network is just a sync mechanism. The database is the boss. The server is just an advisor.

## Data Model Design

This is where you define what your entities look like and how they relate to each other. On the client side, I almost always use **Room** (SQLite under the hood) because it gives you compile-time query verification, Flow/coroutines integration, and handles relationships well enough for most mobile use cases.

```kotlin
@Entity(tableName = "messages")
data class MessageEntity(
    @PrimaryKey val messageId: String,
    val conversationId: String,
    val senderId: String,
    val content: String,
    val timestamp: Long,
    val status: MessageStatus, // SENT, DELIVERED, READ, FAILED
    val isEdited: Boolean = false,
    val localUri: String? = null // for attachments not yet uploaded
)

@Entity(tableName = "conversations")
data class ConversationEntity(
    @PrimaryKey val conversationId: String,
    val title: String?,
    val lastMessagePreview: String?,
    val lastMessageTimestamp: Long,
    val unreadCount: Int = 0
)
```

Now here's where it gets interesting — the tradeoff between **normalization vs denormalization**. In a traditional SQL approach, you'd keep `lastMessagePreview` only in the messages table and join when needed. That's the "textbook correct" answer.

But on mobile? Joins are expensive when you're scrolling through a conversation list with hundreds of items. I denormalize `lastMessagePreview` and `lastMessageTimestamp` into the conversation entity because the conversation list screen needs to render fast, and duplicating a few strings is a tiny storage cost compared to running a join query on every scroll. The tradeoff is that you need to update two tables when a new message arrives, but that's a write-time cost you pay once vs a read-time cost you'd pay on every frame.

> **🔥 Real talk:** I've seen apps stutter during conversation list scrolling because they were doing joins on every bind. Denormalizing those two fields turned a janky scroll into a buttery one. The "clean" database design isn't always the fast one.

## API Design

For most mobile apps, **REST** is still the pragmatic choice. It's well-understood, has great tooling (Retrofit, OkHttp), and the ecosystem is mature. **GraphQL** shines when your screens need data from multiple resources in a single request — imagine a profile screen that needs user info, recent posts, follower count, and mutual friends. With REST, that's 4 API calls. With GraphQL, it's one.

But GraphQL adds client-side complexity (Apollo client, cache normalization, schema management), so I'd only reach for it if you're genuinely dealing with complex, deeply nested data requirements. It's like buying a Swiss Army knife when you just need a screwdriver — yes, it can do everything, but is the extra weight worth it?

### Pagination Strategy

This comes up in every system design interview. Two main approaches — **offset-based** and **cursor-based**.

Offset pagination (`/messages?page=2&limit=20`) is simple but breaks when items are inserted or deleted between page loads — you get duplicates or skip items. Imagine reading a book where someone keeps adding and removing pages while you're reading. You'd lose your place constantly.

**Cursor-based pagination** (`/messages?after=msg_abc123&limit=20`) uses a pointer to the last item you received. It's like putting your finger on the last word you read — no matter how many pages get added or removed, you know exactly where you left off. It's stable even when data changes, which is why every real-time app (chat, social feeds, notifications) should use cursor-based pagination.

```kotlin
data class PaginatedResponse<T>(
    val data: List<T>,
    val nextCursor: String?,
    val hasMore: Boolean
)

// API interface
interface ChatApi {
    @GET("conversations/{id}/messages")
    suspend fun getMessages(
        @Path("id") conversationId: String,
        @Query("after") cursor: String? = null,
        @Query("limit") limit: Int = 30
    ): PaginatedResponse<MessageDto>
}
```

## Client Architecture Deep Dive

Now we get into the low-level design. This is where you show the interviewer you can actually build this thing, not just draw boxes on a whiteboard.

![System Design Overview](/static/post-image/system-design-img2.png)

### Module Structure and Dependency Injection

For a mid-to-large app, I'd structure modules by feature with shared core modules: `:core:network`, `:core:database`, `:core:ui`, `:feature:chat`, `:feature:conversations`, `:feature:profile`. Each feature module depends on core modules but never on other feature modules — this enforces clean boundaries and makes parallel development possible. Think of it like apartments in a building: they all share the same plumbing and electrical (core modules), but apartment A doesn't depend on apartment B's kitchen to function.

**Hilt** is my go-to for dependency injection because it's built on Dagger (compile-time, no reflection) but removes most of the boilerplate. You define your singletons in the app module, scoped dependencies in feature modules, and Hilt handles the rest.

### State Management and Navigation

Each screen gets a ViewModel that exposes a single `StateFlow<ScreenState>` and accepts intents. The UI layer collects the state and renders — that's it. No business logic in the Activity or Fragment. The Activity is just a waiter delivering food to the table, not the chef cooking it.

For navigation, Jetpack Navigation with type-safe arguments works well enough. The key is keeping navigation events in the ViewModel as one-shot events using a `Channel` rather than putting them in the state object, because navigation should happen once, not recompose every time state changes. If you put a "navigate to profile" event in your state object, you'd navigate to the profile screen every time the UI recomposes. Not great.

## Deep Dives — The Hard Parts

### Offline-First and Caching

An **offline-first** pattern means every user action writes to the local database first, then syncs to the server in the background. Think of it like writing in a personal notebook that automatically photocopies itself to the cloud when Wi-Fi is available.

When the user sends a message, it immediately appears in the UI with a "sending" status. A background coroutine picks it up, sends it to the server, and updates the status to "sent" or "failed." This gives instant feedback regardless of network conditions. The user doesn't care about your network stack — they just want to see their message appear. Immediately.

For cache invalidation, I use a **timestamp-based approach** — store the last sync time per data type, and on the next sync, fetch only items modified after that timestamp. It's simpler than version vectors and works well for most mobile apps.

> **⚡ Quick check:** If a user sends a message while offline and then kills the app before going back online, what happens to that message? (Hint: WorkManager is your friend here.)

### Sync and Conflict Resolution

Here's where it gets tricky. When two clients modify the same data offline — say, both users edit a group conversation name at the same time — you need a conflict resolution strategy.

**Last-write-wins** is the simplest: whoever syncs last overwrites the other. It's lossy but acceptable for most non-critical data. For important data like messages, you avoid conflicts entirely because messages are append-only — you don't edit another user's message.

**Optimistic updates** are essential for good UX. Update the UI immediately, send the request in the background, and roll back if it fails. The user sees instant response 99% of the time, and the rare failure case shows a clean error state. It's like a restaurant that starts preparing your usual order the moment they see you walk in — most of the time they're right, and the rare time they're wrong, they just fix it.

### Pagination with Paging 3

Android's **Paging 3 library** handles the heavy lifting of paginated data loading. The `RemoteMediator` pattern is exactly what you need for an offline-first paginated list — it loads data from the network into Room, and the UI observes Room via a `PagingSource`.

When the user scrolls near the end, Paging 3 triggers the RemoteMediator to fetch the next page from the network, insert it into Room, and the PagingSource automatically picks up the changes. The beauty of this approach is that your UI always reads from Room, so offline mode is free — you just don't fetch from the network, and whatever's in the database is what the user sees. No special "offline mode" code path, no if-else branches for connectivity. Room is always the source, network is just a refill mechanism.

> **💡 The "aha" moment:** With RemoteMediator, offline support isn't a feature you build *on top of* your architecture. It falls out naturally from the decision to always read from the local database. Make the right architectural choice, and entire categories of problems just disappear.

## Putting It All Together — Designing a Chat App

To tie everything together, here's how I'd walk through a chat app design in an actual interview. Start with requirements: real-time messaging, conversation list, media attachments, offline support, read receipts.

For architecture, go with MVI + Repository pattern with Room as the source of truth and WebSocket for real-time message delivery. The conversation list uses Paging 3 with RemoteMediator for paginated loading from the server into Room. Individual chat screens maintain a WebSocket connection for live messages and fall back to REST polling if the socket drops.

Messages are stored locally first with a "pending" status, then a `SyncWorker` using WorkManager picks them up and sends them to the server — this handles cases where the user sends a message and immediately kills the app. For the data layer, cursor-based pagination on the API, Room entities with indices on `conversationId` and `timestamp` for fast queries, and an in-memory cache for active conversation metadata.

The conflict resolution is simple — messages are append-only, conversation metadata uses last-write-wins, and the server is the ultimate arbiter of message ordering via server-assigned timestamps.

See how all the pieces connect? Requirements drive architecture, architecture drives data modeling, data modeling drives API design, and the deep-dive details (offline sync, pagination, conflict resolution) are all consequences of decisions you made at the top. It's not a random collection of tech choices — it's a coherent system where every decision reinforces every other decision.

And here we are done!
Thanks for reading!