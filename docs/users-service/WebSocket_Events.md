# WebSocket Events

> Real-time communication events utilizing `socket.io` and `@socket.io/redis-adapter` for scalable presence and messaging.

## General Architecture

- **Endpoint**: Connect directly to the server root (e.g., `ws://localhost:5001/`).
- **Authentication**: JWT token must be provided during the connection handshake. The `socketAuth` middleware verifies this token.
- **Scaling**: Multi-instance deployments use Redis to broadcast events. If User A connects to Instance 1, and User B connects to Instance 2, messages sent between them are routed correctly via the Redis adapter without needing sticky sessions.
- **Reliability**: `connectionStateRecovery` is explicitly **disabled**. It is the client's responsibility to handle `reconnect` events by re-fetching missed messages via the REST API.

---

## 1. Connection & Presence

Presence state is *ephemeral*. It is not permanently stored in the MongoDB database, but dynamically tracked in memory (and across nodes via Redis).

### `user:online` (Server -> Client)
Emitted globally when a user connects.
- **Payload**: `{ userId: "string" }`

### `user:offline` (Server -> Client)
Emitted globally when a user disconnects.
- **Payload**: `{ userId: "string" }`

### `presence:check` (Client -> Server)
Client requests the online status of an array of user IDs.
- **Payload**: `{ userIds: string[] }`

### `presence:online-list` (Server -> Client)
Response to a `presence:check` request.
- **Payload**: `{ onlineUserIds: string[] }`

---

## 2. Conversations & Messaging

Users must explicitly "join" a conversation room to receive live typing indicators, though new messages are pushed by the REST API utilizing the Socket instance.

### `conversation:join` (Client -> Server)
Tells the server the client has opened a specific conversation screen.
- **Payload**: `{ conversationId: "string" }` or `"string"`

### `conversation:leave` (Client -> Server)
Tells the server the client has closed the conversation screen.
- **Payload**: `{ conversationId: "string" }` or `"string"`

### `message:new` (Server -> Client)
Pushed by the server (usually triggered via the REST API controller) when a new message is created.
- **Payload**: The full `Message` MongoDB document.

### `message:seen` (Server -> Client)
Pushed when a user explicitly marks a message as read in a conversation.
- **Payload**: `{ conversationId: "string", userId: "string", seenAt: Date }`

---

## 3. Typing Indicators

### `typing:start` (Client -> Server) -> (Server -> Client)
Client emits it when the user starts typing. The server broadcasts this to all *other* users currently in the `conversation:{id}` room.
- **Payload**: `conversationId: string`
- **Received Payload**: `(conversationId, userId)`

### `typing:stop` (Client -> Server) -> (Server -> Client)
Client emits it when typing stops or input is cleared.
- **Payload**: `conversationId: string`
- **Received Payload**: `(conversationId, userId)`

---

## 4. Notifications

### `notification:new` (Server -> Client)
Pushed by the server whenever a new internal notification is generated for the connected user.
- **Payload**: 
```typescript
{
    id: string;
    type: string;
    subtype: string;
    title: string;
    body: string;
    data?: any;
    createdAt: Date;
}
```

---

## 5. Discussions (Web Events)

### `discussion:join` (Client -> Server)
Joins a dynamic room for an event or topic discussion.
- **Payload**: `{ collectionType: "events" | "posts", topicId: "string" }`
