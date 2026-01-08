import { Socket } from 'socket.io';
import { SocketData, SOCKET_EVENTS } from './socket.types';

// Notes:
// - Presence is ephemeral state (not stored in DB).
// - This is a best-effort implementation for real-time status.
// - Scalability: In a multi-instance setup, Redis Adapter handles broadcasting these events across nodes.

export const handlePresenceConnection = (socket: Socket) => {
    const user = (socket.data as SocketData).user;
    if (!user) return;

    // Join a room specific to this user (useful for targeted events later)
    socket.join(`user:${user._id}`);

    // Emit 'presence:online' to all connected clients (globally or scoped if needed)
    // In strict friends-only apps, we would only emit to friends' rooms.
    // Here we broadcast globally as a simple "Online" indicator for anyone looking.
    socket.broadcast.emit(SOCKET_EVENTS.PRESENCE.ONLINE, { userId: user._id });

    // Handle initial presence check from client
    socket.on(SOCKET_EVENTS.PRESENCE.CHECK, (payload: { userIds: string[] }) => {
        const onlineUserIds: string[] = [];
        if (payload.userIds && Array.isArray(payload.userIds)) {
            payload.userIds.forEach((userId) => {
                // Check if room 'user:{userId}' exists
                const room = socket.nsp.adapter.rooms.get(`user:${userId}`);
                if (room && room.size > 0) {
                    onlineUserIds.push(userId);
                }
            });
        }
        // Send back the list of online users
        socket.emit(SOCKET_EVENTS.PRESENCE.ONLINE_LIST, { onlineUserIds });
    });

    socket.on('disconnect', () => {
        // Ephemeral: We don't write to DB. Just notify others.
        socket.broadcast.emit(SOCKET_EVENTS.PRESENCE.OFFLINE, { userId: user._id });
    });
};
