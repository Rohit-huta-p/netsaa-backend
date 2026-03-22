# Architecture Overview: Users Service

> A comprehensive look at the high-level architecture, dependencies, and flow of the Users Service.

## 1. Core Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js (REST API handling)
- **Language**: TypeScript (compiled to `dist/`)
- **Database**: MongoDB (via `mongoose` ORM)
- **Real-time Engine**: Socket.IO
- **Cache / PubSub**: Redis (via `ioredis` and `@socket.io/redis-adapter`)
- **Validation**: Zod (for request payload validation)
- **Authentication**: JWT (JSON Web Tokens) & `bcryptjs` for password hashing

## 2. System Boundaries & Dependencies

The `users-service` operates as a central nervous system for user identity and real-time interaction in the NETSA platform.

- **Frontend Clients**: Connect via HTTP REST API (port `5001`) and WebSocket (Socket.IO).
- **Other Microservices**: Will typically communicate with the `users-service` to validate tokens or fetch user profiles.
- **MongoDB**: Persistent storage for User accounts, Posts (if applicable via profile), Notifications, Messaging, Connections, and Settings.
- **Redis**: Used to synchronize Socket.IO events across multiple instances of the service, ensuring messages sent to a user connected to Instance A are delivered if the sender is on Instance B.

## 3. Directory Structure

```text
users-service/
├── src/
│   ├── config/          # Environment configuration loaders
│   ├── connections/     # Social graph (friends/followers) & Messaging logic
│   ├── controllers/     # HTTP endpoint handlers (Auth, Users)
│   ├── middleware/      # Express middlewares (Auth guard, error handling)
│   ├── models/          # Mongoose schema definitions
│   ├── notifications/   # System and user notification logic
│   ├── routes/          # Express route definitions pointing to controllers
│   ├── settings/        # Account settings, privacy, display preferences
│   ├── sockets/         # Real-time event definitions (chat, online status)
│   ├── types/           # Global TypeScript interface definitions
│   ├── validators/      # Zod schemas for input sanitization
│   ├── workers/         # Background cron-like jobs (e.g., account deletion)
│   ├── app.ts           # Express application setup and middleware mounting
│   └── server.ts        # HTTP server initialization and DB connection
├── docs/                # Self-contained service documentation
├── .env                 # Local environment variables
└── package.json         # Dependencies and scripts (build, start, test)
```

## 4. Key Request Flows

### HTTP API Flow (e.g., Fetch Profile)
1. **Client** -> `GET /api/users/:id`
2. **Router (`routes/users.ts`)**: Maps endpoint to `getUserById`.
3. **Middleware (`middleware/auth.ts`)**: Protects route, verifies JWT, attaches `req.user`.
4. **Controller (`controllers/userController.ts`)**: Executes business logic.
5. **Model (`models/User.ts`)**: Queries MongoDB.
6. **Response**: Controller formats payload and returns HTTP 200 JSON to Client.

### Real-Time Flow (e.g., Direct Message)
1. **Client** establishes persistent connection to `/` namespace via `socket.io-client`.
2. Socket attached in `server.ts` handles authorization (JWT check on connection).
3. **Client** emits `sendMessage` event payload.
4. **Socket Handler (`sockets/index.ts` -> `connections/messages.socket.ts`)** validates payload, saves message to MongoDB.
5. **Server** emits `newMessage` back to specific connected client via `io.to('Room/SocketID')`.

## 5. Security Principles
- **Route Protection**: All non-public endpoints require a `Bearer <token>` in the Authorization header.
- **Input Validation**: `zod` is used on critical endpoints to ensure payload integrity.
- **Soft Deletion**: Accounts use a `deactivated` status and a flag (`scheduledForDeletion`) instead of hard deletion to maintain referential integrity with messages/posts. A dedicated worker cleans them up after a holding period.
- **Cross-Origin Resource Sharing (CORS)**: Strictly defined origins (`http://localhost:8081`, `https://netsaa.onrender.com`) are allowed.
