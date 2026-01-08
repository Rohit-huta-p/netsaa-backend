import { Server, Socket } from 'socket.io';
import { SocketData, SOCKET_EVENTS } from './socket.types';
import { joinConversation, leaveConversation } from './socket.rooms';
import { getIO } from './socket.instance';

export const handleMessagingEvents = (socket: Socket, io: Server) => {
    const user = (socket.data as SocketData).user;
    if (!user) return;

    socket.on(SOCKET_EVENTS.CONVERSATION.JOIN, async (payload: any) => {
        const conversationId = typeof payload === 'object' && payload.conversationId ? payload.conversationId : payload;
        // console.log(`Joining conversation: ${conversationId}`); 
        await joinConversation(socket, conversationId);
    });

    socket.on(SOCKET_EVENTS.CONVERSATION.LEAVE, (payload: any) => {
        const conversationId = typeof payload === 'object' && payload.conversationId ? payload.conversationId : payload;
        leaveConversation(socket, conversationId);
    });

    socket.on(SOCKET_EVENTS.TYPING.START, (conversationId: string) => {
        // SECURITY: We only emit to the specific room `conversation:{id}`.
        // Since clients can only join rooms they are authorized for (checked in joinConversation),
        // this ensures no cross-conversation leakage.
        socket.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.TYPING.START, conversationId, user._id);
    });

    socket.on(SOCKET_EVENTS.TYPING.STOP, (conversationId: string) => {
        socket.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.TYPING.STOP, conversationId, user._id);
    });

    // Discussion Support
    socket.on(SOCKET_EVENTS.DISCUSSION.JOIN, (payload: { collectionType: string, topicId: string }) => {
        const { collectionType, topicId } = payload;
        if (collectionType && topicId) {
            const roomName = `discussion:${collectionType}:${topicId}`;
            // console.log(`Joining discussion room: ${roomName}`);
            socket.join(roomName);
        }
    });
};

// Helper function to emit new message event from Controllers (REST layer)
// This effectively decouples the controller from the socket implementation details.
export const emitNewMessage = (conversationId: string, message: any) => {
    try {
        const io = getIO();
        if (io) {
            // TODO: Redis Pub/Sub Explanation
            // In a multi-instance deployment, this `io.to().emit()` call only reaches sockets connected to THIS instance.
            // The `@socket.io/redis-adapter` (configured in socket.redis.ts) intercepts this.
            // It publishes the packet to Redis. Other instances subscribe to Redis, receive the packet,
            // and emit it to their local sockets in the target room.
            // This ensures horizontal scaling works seamlessly.
            io.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.MESSAGE.NEW, message);
        }
    } catch (err) {
        console.warn('Socket IO not initialized yet, skipping message emission');
    }
};

export const emitMessageSeen = (conversationId: string, userId: string) => {
    try {
        const io = getIO();
        if (io) {
            // Redis adapter handles broadcasting this to all instances
            io.to(`conversation:${conversationId}`).emit(SOCKET_EVENTS.MESSAGE.SEEN, {
                conversationId,
                userId,
                seenAt: new Date()
            });
        }
    } catch (err) {
        console.warn('Socket IO not initialized yet, skipping seen emission');
    }
};
