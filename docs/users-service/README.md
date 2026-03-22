# Users Service

> Core backend service handling user authentication, profiles, social connections, and real-time messaging for the NETSA platform.

## Quick Start

### Prerequisites
- Node.js (v18+ recommended)
- MongoDB instance
- Redis server (for WebSocket capabilities)

### Installation

```bash
cd users-service
npm install
```

### Running the Service

```bash
# Development
npm run dev

# Production
npm run build
npm start

# Testing
npm run test
```

## Features

- **Authentication**: JWT-based auth, registration, login, token refresh.
- **User Management**: Profile viewing, updating, privacy settings, active status tracking.
- **Social Connections**: Peer-to-peer connection management (friends/following).
- **Real-time Messaging**: Socket.IO integrated direct messaging and conversations.
- **Notifications**: System and user-to-user real-time and persistent notifications.
- **Background Workers**: Automated tasks (e.g., permanent deletion of deactivated accounts).

## Configuration

The service requires the following environment variables (defined in `.env`):

| Variable | Description | Example / Default |
|----------|-------------|---------|
| `PORT` | Server listening port | `5001` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/netsa` |
| `JWT_SECRET` | Secret key for JWT signing | `mysecrettoken` |
| `ENABLE_SOCKET_REDIS` | Boolean to enable Redis adapter for Socket.IO | `true` |
| `REDIS_URL` | Redis server connection string | `redis://localhost:6379` |

## Documentation

This service has extensive internal documentation divided by domain:

- [Architecture Overview](./Architecture.md)
- [API Reference: Authentication](./api/auth.md)
- [API Reference: Users & Settings](./api/users_and_settings.md)
- [API Reference: Connections & Messaging](./api/connections_and_messaging.md)
- [API Reference: Notifications & Organizers](./api/notifications_and_organizers.md)
- [Database Models](./Database_Models.md)
- [WebSocket Events](./WebSocket_Events.md)
- [Background Workers](./Background_Workers.md)

## License

ISC
