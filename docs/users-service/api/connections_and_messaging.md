# API Reference: Connections & Messaging

> Endpoints for managing social graphs (connections), conversation threads, and direct messages.
> Note: All routes require `Authorization: Bearer <token>`.

---

## 1. Connections API

**Base URL**: `/api/connections`

### POST /request
Send a connection request to another user.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `recipientId` | string | Yes | ID of the user to connect with |
| `message` | string | No | Optional invite message |

**Response:**
- `201 Created`: Returns the pending Connection object.
- `400 Bad Request`: If recipient rejects requests via settings or if already connected.

### PATCH /:connectionId/accept
Accept an incoming connection request.

**Response:**
- `200 OK`: Connection status updated to `accepted`.

### PATCH /:connectionId/reject
Reject an incoming connection request.

**Response:**
- `200 OK`: Connection status updated to `rejected`.

### PATCH /:connectionId/block
Block a user within a connection context.

**Response:**
- `200 OK`: Connection status updated to `blocked`.

### GET / requests
List pending incoming connection requests.

**Response:**
- `200 OK`: Array of Connection objects where current user is the recipient.

### GET /requests/sent
List pending outgoing connection requests.

**Response:**
- `200 OK`: Array of Connection objects where current user is the requester.

### GET /
List all accepted connections (friends).

**Response:**
- `200 OK`: Array of accepted Connection objects.

### DELETE /:connectionId
Remove an existing connection completely.

**Response:**
- `200 OK`: Connection removed successfully.

---

## 2. Conversations API

**Base URL**: `/api/conversations`

### GET /
List all active conversation threads for the authenticated user.

**Response:**
- `200 OK`: Array of Conversations, including latest message snippets and participant details.

### POST /
Create a new conversation or retrieve an existing 1-on-1 thread.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `participantIds` | string[] | Yes | Array of User IDs to start a chat with |

**Response:**
- `200 OK` or `201 Created`: The Conversation object.

### GET /:id
Retrieve details of a specific conversation (participants, metadata).

**Response:**
- `200 OK`: The Conversation object.

---

## 3. Messages API

**Base URL**: `/api/messages`

### POST /:conversationId
Send a new message in a conversation. Protected by `ensureConversationAccess` middleware.

**Parameters (Path):**
- `conversationId`: ID of the target conversation.

**Parameters (Body):**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `content` | string | Yes | Text content of the message |
| `attachments`| string[] | No | Array of media URLs |

**Response:**
- `200 OK`: The created Message object.
- `403 Forbidden`: User is not a participant in the conversation.

### GET /:conversationId
Retrieve message history for a conversation. Protected by `ensureConversationAccess` middleware.

**Parameters (Query):**
- Pagination support (e.g., `limit`, `skip`/`cursor`) usually applies here. Ensure to pass appropriate query parameters if implemented by the controller.

**Response:**
- `200 OK`: Array of Message objects sorted chronologically.

### PATCH /:messageId/seen
Mark a specific message as seen by the current user.

**Response:**
- `200 OK`: Message's read receipt updated.
