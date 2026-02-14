---
title: "Design a Chat Application"
date: 2026-02-14
layout: interview
tags: [System Design Round]
order: 3
sequence: 57
description: "Chat applications are a favorite in mobile system design interviews because they combine real-time communication, offline support, local persistence,..."
---

## Design a Chat Application

Chat apps are like the final boss of mobile system design. You've got real-time communication, offline support, local persistence, and sync logic all fighting for attention in one problem. If you can design a chat app well, you can design almost anything.

#### How would you layer the client architecture for a chat app?

Think of it like a restaurant. The UI layer is the dining room — chat list, conversation screen, media viewer — all observing state from ViewModels. The domain layer is the kitchen — use cases for sending messages, syncing conversations, managing read receipts. The data layer is the supply chain — a repository coordinating between Room (your local source of truth), a WebSocket for real-time messaging, and REST APIs for history and media.

But here's where chat apps get their own special sauce. You also need:
- **Sync engine** — a background component handling message delivery, retry logic, and conflict resolution
- **Connection manager** — manages the WebSocket lifecycle, reconnection with backoff, and connection state

The Room database is the single source of truth. Incoming messages from the WebSocket get written to the database first, then displayed. Outgoing messages? Same thing — written to the database with a `PENDING` status first, then sent over the network. The UI just observes the database and stays blissfully unaware of all the networking chaos happening underneath.

#### Why WebSocket over long polling or SSE for real-time messaging?

Here's the thing. You've got three options, but only one makes real sense for chat.

**WebSocket** is a full-duplex, persistent TCP connection. After an HTTP handshake upgrade, both client and server can send messages at any time with minimal overhead (2-byte frame header). It's like having a phone call — both sides can talk whenever they want.

**Long polling** is more like texting someone who takes forever to reply. The client sends an HTTP request, the server holds it open until there's new data or a timeout, sends the response, and the client immediately asks again. It works through all proxies and firewalls but has a latency gap between each response-request cycle.

**SSE (Server-Sent Events)** is a one-way megaphone from server to client over HTTP. The server pushes events, but the client can't talk back on the same connection. Not great when you, you know, need to *send* messages too.

For chat, WebSocket wins. OkHttp has built-in support for it, so the client side is straightforward. Long polling is a reasonable fallback when WebSocket connections are blocked by network proxies.

#### What data model would you use for messages?

A message needs enough metadata to be ordered, displayed, and synced correctly.

```kotlin
@Entity(
    tableName = "messages",
    indices = [
        Index(value = ["conversationId", "timestamp"]),
        Index(value = ["clientMessageId"], unique = true)
    ]
)
data class MessageEntity(
    @PrimaryKey val id: String,
    val clientMessageId: String,
    val conversationId: String,
    val senderId: String,
    val content: String,
    val type: MessageType,
    val timestamp: Long,
    val localTimestamp: Long,
    val status: MessageStatus,
    val mediaUrl: String? = null,
    val mediaLocalPath: String? = null
)

enum class MessageStatus { PENDING, SENT, DELIVERED, READ, FAILED }
enum class MessageType { TEXT, IMAGE, VIDEO, FILE }
```

The `clientMessageId` is the unsung hero here. It's a UUID generated on the client when the message is created, and it handles deduplication. Picture this: the network drops *after* the server receives your message but *before* you get the acknowledgment. You retry with the same `clientMessageId`, the server sees it's a duplicate and ignores it. Crisis averted. The `id` field is the server-assigned ID that arrives with the acknowledgment.

> **🧠 Think about it:** What would happen if you only used server-assigned IDs and had no `clientMessageId`? How would you know if a message was sent successfully when the ACK never arrives?

#### How does the offline message queue work?

Write the message to the local database with `PENDING` status immediately. The user sees their message in the conversation right away — instant feedback. Then queue it for delivery and send it when the network is available. It's like dropping a letter in your outbox. You wrote it, it's there, it just hasn't been picked up by the mail carrier yet.

```kotlin
class SendMessageUseCase(
    private val messageDao: MessageDao,
    private val chatSocket: ChatConnectionManager,
    private val networkMonitor: NetworkMonitor
) {
    suspend fun send(conversationId: String, content: String) {
        val message = MessageEntity(
            id = "",
            clientMessageId = UUID.randomUUID().toString(),
            conversationId = conversationId,
            senderId = currentUserId,
            content = content,
            type = MessageType.TEXT,
            timestamp = 0,
            localTimestamp = System.currentTimeMillis(),
            status = MessageStatus.PENDING
        )

        messageDao.insert(message)

        if (networkMonitor.isOnline.value && chatSocket.isConnected) {
            chatSocket.sendMessage(message)
        }
    }
}
```

When the network returns, the sync engine queries all `PENDING` messages and sends them in order. Once the server ACKs, update the status to `SENT`. If the user was offline for a while and has dozens of queued messages, send them sequentially to preserve ordering.

#### How do you handle message ordering? What problems can arise?

Yeah, this trips up everyone. It sounds simple — just sort by timestamp, right? But whose timestamp?

You can't rely on client timestamps because phone clocks are unreliable — two users' devices might differ by minutes. You can't rely solely on server timestamps either because network latency means messages arrive at the server in a different order than they were sent. So you get this weird situation where Alice's reply shows up *before* Bob's question.

The practical solution:
- Use the **server timestamp** as the canonical ordering. The server assigns a monotonically increasing timestamp when it receives a message
- Use the **client timestamp** as a secondary sort for pending messages that haven't been acknowledged yet
- Within the same conversation, assign a **sequence number** — a strictly incrementing integer per conversation. Simpler than timestamps and immune to clock skew

```kotlin
@Dao
interface MessageDao {
    @Query("""
        SELECT * FROM messages 
        WHERE conversationId = :conversationId 
        ORDER BY 
            CASE WHEN status = 'PENDING' THEN localTimestamp 
            ELSE timestamp END ASC
    """)
    fun getMessagesForConversation(
        conversationId: String
    ): Flow<List<MessageEntity>>
}
```

For 1:1 chats, server timestamps with sequence numbers work well. For distributed systems with multiple servers, you might need vector clocks or Lamport timestamps, but that's beyond what most mobile interviews expect.

#### How do you handle retry logic and delivery guarantees?

Chat apps need at-least-once delivery — every message *must* eventually reach the server. Think of it like a persistent delivery driver who keeps coming back until someone signs for the package.

- When a message fails to send, mark it as `FAILED` and schedule a retry
- Use exponential backoff: 1s, 2s, 4s, 8s, 16s — capped at 60 seconds
- After a configurable number of retries (e.g., 10), stop and show a "failed to send" indicator with a manual retry button
- On network reconnection, retry all `PENDING` and `FAILED` messages in order

```kotlin
class MessageRetryManager(
    private val messageDao: MessageDao,
    private val chatSocket: ChatConnectionManager
) {
    suspend fun retryPendingMessages() {
        val pending = messageDao.getPendingMessages()
        for (message in pending) {
            var retryCount = 0
            var success = false
            while (!success && retryCount < 10) {
                try {
                    chatSocket.sendMessage(message)
                    messageDao.updateStatus(
                        message.clientMessageId, MessageStatus.SENT
                    )
                    success = true
                } catch (e: IOException) {
                    retryCount++
                    delay(minOf(1000L * (1 shl retryCount), 60_000L))
                }
            }
            if (!success) {
                messageDao.updateStatus(
                    message.clientMessageId, MessageStatus.FAILED
                )
            }
        }
    }
}
```

Deduplication on the server side is critical. The server uses `clientMessageId` to detect duplicates — if it receives the same `clientMessageId` twice, it ignores the second one and returns the original response.

#### How do you manage the WebSocket connection lifecycle?

The WebSocket connection should be alive when the app is in the foreground — connect when the app comes up, disconnect when it goes to the background, reconnect on failure with exponential backoff, and send periodic heartbeats to detect stale connections. It's like keeping a walkie-talkie channel open: you hold the button when you're talking, release when you're done.

```kotlin
class ChatConnectionManager(
    private val okHttpClient: OkHttpClient
) {
    private var webSocket: WebSocket? = null
    private var retryCount = 0

    fun connect() {
        val request = Request.Builder()
            .url("wss://chat.example.com/ws")
            .build()

        webSocket = okHttpClient.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onMessage(ws: WebSocket, text: String) {
                    retryCount = 0
                    handleIncomingMessage(text)
                }
                override fun onFailure(
                    ws: WebSocket, t: Throwable, response: Response?
                ) {
                    scheduleReconnect()
                }
            }
        )
    }

    private fun scheduleReconnect() {
        val delay = minOf(1000L * (1 shl retryCount), 30_000L)
        retryCount++
        // Schedule reconnect after delay
    }
}
```

Don't keep the WebSocket open in the background — it holds a wake lock and drains battery like nobody's business. Use FCM push notifications to wake the app for new messages when it's backgrounded.

#### How do you structure the local Room database schema?

The database needs three main entities: conversations, messages, and users. Design the schema around your query patterns — what are you going to ask the database most often?

```kotlin
@Entity(tableName = "conversations")
data class ConversationEntity(
    @PrimaryKey val id: String,
    val title: String?,
    val lastMessageContent: String?,
    val lastMessageTimestamp: Long,
    val unreadCount: Int,
    val isGroup: Boolean,
    val participantIds: String
)

@Dao
interface ConversationDao {
    @Query("""
        SELECT * FROM conversations 
        ORDER BY lastMessageTimestamp DESC
    """)
    fun observeConversations(): Flow<List<ConversationEntity>>

    @Query("""
        UPDATE conversations SET unreadCount = 0 
        WHERE id = :conversationId
    """)
    suspend fun clearUnreadCount(conversationId: String)
}
```

Plot twist: you want to *denormalize* here. Stick `lastMessageContent` and `lastMessageTimestamp` directly in the conversation entity. Yeah, it's redundant data — but it avoids a JOIN query every time the conversation list loads. Update those fields whenever a new message arrives. Index the `messages` table on `(conversationId, timestamp)` since the most common query is fetching messages for a conversation in chronological order.

#### What are the core features you would include in a chat application?

Start with the essentials and go deep rather than wide:
- **1:1 and group messaging** — send and receive text messages in real time
- **Media messages** — images, videos, and files
- **Read receipts** — show when a message was delivered and read
- **Push notifications** — alert the user when the app is in the background
- **Offline support** — queue outgoing messages while offline and deliver them when connectivity returns

Start with 1:1 text messaging and expand from there. Depth beats breadth here.

#### What are the key non-functional requirements for a chat app?

- **Real-time delivery** — messages should arrive within a few hundred milliseconds under normal conditions
- **Offline-first** — the app must be fully usable without a network connection. Read old conversations, compose new messages, everything gets queued
- **Reliability** — every message must eventually reach the server. At-least-once delivery with deduplication
- **Scale** — the data model and sync logic should handle conversations with thousands of messages and hundreds of conversations without the client choking

#### What's in scope and what's out of scope for a mobile system design interview?

**In scope** — client architecture, data model, real-time connection strategy, offline queue, local database, sync logic, push notifications, message ordering, and retry mechanism.

**Out of scope** — server-side message routing and fan-out, infrastructure scaling (Kafka, sharding), signaling for voice/video calls, and payment features. Mention these briefly if asked, but don't spend time designing them.

> **🧠 Think about it:** If someone asks you to design the *server-side* fan-out for group messages, how would you redirect the conversation back to mobile-specific challenges?

#### What does the API design look like for conversations and messages?

Two API surfaces — REST for CRUD and history, WebSocket for real-time events. Think of REST as the filing cabinet and WebSocket as the live phone line.

**REST endpoints:**
- `GET /conversations` — fetch the user's conversation list with last message preview
- `GET /conversations/{id}/messages?after={timestamp}&cursor={cursor}` — paginated message history for syncing after offline
- `POST /conversations` — create a new conversation (1:1 or group)
- `POST /media/upload` — upload media files, returns a URL

**WebSocket events (bidirectional):**
- Client sends: `message.send`, `typing.start`, `typing.stop`, `receipt.read`
- Server sends: `message.new`, `message.ack`, `typing.update`, `receipt.update`, `presence.update`

Every WebSocket message includes a `clientMessageId` so the client can correlate acknowledgments with pending messages. REST handles bulk operations and history, WebSocket handles the real-time flow.

#### How do push notifications work for a chat app?

When the app is backgrounded, the server sends a push notification through FCM. Here's the thing — you want a **data message**, not a notification message.

- **Data message** — always delivered to your `FirebaseMessagingService`, even when the app is in the background. You control the notification UI completely
- **Notification message** — the system handles display when the app is backgrounded. You lose control over grouping, actions, and formatting

When the user taps the notification, deep link to the specific conversation. Use notification channels and message grouping so multiple messages from the same conversation stack neatly instead of flooding the notification shade. And if the WebSocket is already connected and the app is in the foreground? The server should skip the push entirely — the client already got the message over the socket.

#### How do you sync message history after the app has been offline?

When the app opens after being offline, it needs to catch up. The client stores a `lastSyncTimestamp` for each conversation and requests everything after it. It's like returning to work after vacation and asking "what did I miss since Monday?"

```kotlin
class MessageSyncManager(
    private val api: ChatApi,
    private val messageDao: MessageDao
) {
    suspend fun syncConversation(conversationId: String) {
        val lastTimestamp = messageDao
            .getLastMessageTimestamp(conversationId) ?: 0

        var cursor: String? = null
        do {
            val response = api.getMessages(
                conversationId = conversationId,
                after = lastTimestamp,
                cursor = cursor
            )
            messageDao.insertAll(response.messages)
            cursor = response.nextCursor
        } while (response.hasMore)
    }
}
```

This sync happens in the background after connecting the WebSocket. The WebSocket handles real-time messages going forward, and the REST sync fills in the gap for what was missed while offline. Use cursor-based pagination to handle large gaps efficiently.

#### How do you implement read receipts?

Track three states per message: **sent**, **delivered**, and **read**.

- **Sent** — the server received the message. The client gets an ACK over WebSocket
- **Delivered** — the recipient's device received the message. The recipient's client sends a delivery confirmation to the server
- **Read** — the recipient actually viewed the message. When the conversation screen is visible and the user scrolls past a message, send a read receipt

```kotlin
class ReadReceiptManager(
    private val chatSocket: ChatConnectionManager,
    private val messageDao: MessageDao
) {
    fun markAsRead(conversationId: String, lastReadMessageId: String) {
        chatSocket.sendReadReceipt(conversationId, lastReadMessageId)
        messageDao.markMessagesAsRead(conversationId, lastReadMessageId)
    }
}
```

Batch your read receipts — don't send one for every single message. When the user scrolls through 20 unread messages, send a single receipt with the ID of the *last* message they saw. The server marks everything up to that ID as read.

#### How do you implement typing indicators?

The client detects text input changes and sends a "typing" event over the WebSocket. The receiving client shows "typing..." and hides it after a timeout. Simple concept, but the devil is in the details:

- **Debounce** — don't send a typing event on every keystroke. That's just spamming the server. Debounce to once every 2-3 seconds while the user is actively typing
- **Timeout** — the receiver hides the typing indicator after 5 seconds if no new typing event arrives
- **Stop event** — send a "stopped typing" event when the input field becomes empty or the user sends the message

```kotlin
class TypingIndicatorManager(
    private val chatSocket: ChatConnectionManager,
    private val scope: CoroutineScope
) {
    private var typingJob: Job? = null

    fun onTextChanged(conversationId: String, text: String) {
        if (text.isEmpty()) {
            typingJob?.cancel()
            chatSocket.sendTypingEvent(conversationId, false)
            return
        }
        if (typingJob?.isActive != true) {
            chatSocket.sendTypingEvent(conversationId, true)
        }
        typingJob?.cancel()
        typingJob = scope.launch {
            delay(3000)
            chatSocket.sendTypingEvent(conversationId, false)
        }
    }
}
```

Typing indicators are low-priority — don't persist them to the database or queue them for offline delivery. They're fire-and-forget over the WebSocket. Nobody cares that you *were* typing three hours ago.

#### How do you handle media messages like images and videos?

Media messages have a completely different flow from text because the file needs to be uploaded separately from the message metadata. Think of it as sending a postcard versus sending a package — the package needs special handling.

1. User selects a photo. Compress it and generate a thumbnail locally
2. Insert a message into the local database with `PENDING` status and the local file path. Show the thumbnail in the chat immediately
3. Upload the file to a storage service (S3, Cloud Storage) in the background. Show upload progress in the UI
4. When the upload completes, send the message metadata (including the media URL) over the WebSocket
5. The recipient receives the message, downloads the thumbnail first (fast), then the full image on demand or automatically on Wi-Fi

```kotlin
class MediaMessageSender(
    private val fileUploader: FileUploader,
    private val messageDao: MessageDao,
    private val chatSocket: ChatConnectionManager
) {
    suspend fun sendImage(conversationId: String, imageUri: Uri) {
        val compressed = compressImage(imageUri, 1920, 80)
        val thumbnail = createThumbnail(compressed, 200)

        val message = MessageEntity(
            clientMessageId = UUID.randomUUID().toString(),
            conversationId = conversationId,
            type = MessageType.IMAGE,
            status = MessageStatus.PENDING,
            mediaLocalPath = compressed.absolutePath
        )
        messageDao.insert(message)

        val mediaUrl = fileUploader.upload(compressed)
        val thumbUrl = fileUploader.upload(thumbnail)
        messageDao.updateMediaUrl(message.clientMessageId, mediaUrl, thumbUrl)
        chatSocket.sendMediaMessage(message.clientMessageId, mediaUrl, thumbUrl)
    }
}
```

For large files like videos, use chunked upload with resume support so the upload survives network interruptions. Use WorkManager for background uploads to survive process death.

#### How do you make the chat list screen performant?

The chat list shows all conversations sorted by most recent message. The ViewModel observes a Room Flow that returns conversations ordered by `lastMessageTimestamp DESC`. When a new message arrives via WebSocket, the repository updates the conversation's `lastMessageContent`, `lastMessageTimestamp`, and `unreadCount`. Room's Flow automatically triggers a UI update. No manual "refresh" needed.

For performance with hundreds of conversations:
- Use `DiffUtil` with RecyclerView (or `key` in LazyColumn) to only update the items that changed
- Paginate the conversation list using the Paging library if the user has thousands of conversations
- Load contact photos from an in-memory image cache — don't hit the network for avatars on every scroll

The unread count badge should be reactive — decrement it when the user opens a conversation and reads messages. This is a local database update, not a network call.

#### How would you implement message search?

Full-text search across all messages needs a different approach than standard SQL queries. Room supports FTS (Full-Text Search) through virtual tables. It's like giving your database its own little search engine.

```kotlin
@Fts4(contentEntity = MessageEntity::class)
@Entity(tableName = "messages_fts")
data class MessageFts(val content: String)

@Dao
interface SearchDao {
    @Query("""
        SELECT messages.* FROM messages
        JOIN messages_fts ON messages.rowid = messages_fts.rowid
        WHERE messages_fts MATCH :query
        ORDER BY messages.timestamp DESC
        LIMIT 50
    """)
    suspend fun searchMessages(query: String): List<MessageEntity>
}
```

FTS tables create an inverted index over the content column, making text search fast even with millions of messages. The tradeoff? Increased database size — the FTS index can be 50-100% of the original data size. For most chat apps this is totally acceptable because message text is relatively small. Show search results grouped by conversation so the user can jump to the relevant context.

> **🧠 Think about it:** What happens to FTS performance if your chat app supports media messages with captions? Would you index the captions too, or keep FTS strictly for text messages?

#### How does end-to-end encryption work at a high level?

End-to-end encryption means the server is just a dumb mailman — it delivers the envelope but can't read the letter inside. Only the sender and recipient have the decryption keys.

- Each user generates a public/private key pair. The public key goes to the server. The private key stays on the device in Android KeyStore
- When User A sends a message to User B, the client encrypts using User B's public key
- The server receives and stores the encrypted blob. It can route it but can't read it
- User B's client decrypts using their private key

In practice, apps like Signal use the Signal Protocol which adds forward secrecy through ratcheting key exchanges — each message uses a different encryption key derived from a chain. If one key is compromised, previous and future messages remain secure. For a mobile interview, explaining the public/private key concept and mentioning the Signal Protocol is sufficient depth. Focus on how it affects the client architecture: the encryption/decryption layer sits between the message sending logic and the network layer, and key management uses Android KeyStore.

#### How does group messaging differ from 1:1 chats?

Group messaging takes everything you just learned and adds a multiplayer mode. Here's where it gets more complex:

- **Delivery receipts** — in 1:1, a message is delivered when the other person gets it. In a group, delivery and read status are per-participant. Show "delivered to all" or "read by 5 of 8" instead of individual indicators
- **Typing indicators** — multiple people can type simultaneously. Show "Alice and Bob are typing..." or "3 people are typing..."
- **Message fan-out** — the server handles distributing the message to all group members. The client sends it once
- **Member management** — adding/removing members, admin roles, group name and photo changes show in the chat timeline as system messages
- **Sync complexity** — when a user is added to an existing group, decide how much history they can see (all, last 30 days, none)

The data model stays mostly the same — the `conversationId` just maps to a group instead of a pair of users. The `ConversationEntity` has an `isGroup` flag and stores participant IDs.

### Common Follow-ups

- How would you implement message reactions (like emoji reactions on individual messages)?
- How do you handle message deletion — soft delete vs hard delete? What about "delete for everyone"?
- How would you implement voice messages and voice notes?
- How do you handle message forwarding across conversations?
- What's your strategy for handling stickers and custom emoji packs?
- How would you handle blocked users — at the client level or server level?
- How do you test the WebSocket connection layer? What do you mock?
- How would you handle a scenario where the server goes down — what does the client experience?
