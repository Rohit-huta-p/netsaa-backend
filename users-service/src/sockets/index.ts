import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './socket.types';
import { redisAdapter } from './socket.redis';
import { socketAuth } from './socket.auth';
import { handlePresenceConnection } from './presence.socket';
import { handleMessagingEvents } from './messaging.socket';

import { setIO } from './socket.instance';

export const initSocketServer = (httpServer: HttpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: '*', // Allow all origins for dev simplicity
            methods: ['GET', 'POST']
        },
        adapter: redisAdapter,
        // STRICT RELIABILITY RULES:
        // 1. connectionStateRecovery is DISABLED (default). Events are NOT buffered or replayed.
        // 2. Clients must handle 'reconnect' events by:
        //    a. Re-joining conversation rooms.
        //    b. Fetching missing messages via REST API (source of truth).
        // 3. This ensures no state mismatch or duplicate event processing complexity on the server.
    });

    setIO(io);

    io.use(socketAuth);

    io.on('connection', (socket) => {
        // console.log(`Socket connected: ${socket.id}`);

        // Presence handlers
        handlePresenceConnection(socket);

        // Messaging handlers
        handleMessagingEvents(socket, io);
    });

    return io;
};

// getIO is now exported from socket.instance.ts
export { getIO } from './socket.instance';

