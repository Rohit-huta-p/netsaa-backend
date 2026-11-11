import { Server, Socket } from 'socket.io';
import { SocketData, SOCKET_EVENTS } from './socket.types';
import { joinConversation, leaveConversation } from './socket.rooms';
import { getIO } from './socket.instance';
import Conversation from '../connections/conversations.model';

// ─── Discussion access check ─────────────────────────────────────────────────
// Calls the owning service to validate whether a given user may join a
// discussion room. Best-effort: deny on timeout or service-down (safe default).

const gigsServiceUrl  = () => process.env.GIGS_SERVICE_URL  || 'http://localhost:5002';
const eventsServiceUrl = () => process.env.EVENTS_SERVICE_URL || 'http://localhost:5010';

async function checkDiscussionAccess(
    collectionType: string,
    topicId: string,
    userId: string
): Promise<boolean> {
    const token = process.env.INTERNAL_SERVICE_TOKEN || '';
    if (!token) {
        console.warn('[discussion] INTERNAL_SERVICE_TOKEN not set — allowing discussion join');
        return true;
    }

    let url: string;
    if (collectionType === 'gig') {
        url = `${gigsServiceUrl()}/internal/discussion/gig/${topicId}?userId=${userId}`;
    } else if (collectionType === 'event') {
        url = `${eventsServiceUrl()}/internal/discussion/event/${topicId}?userId=${userId}`;
    } else {
        return true; // unknown type: allow
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
        });
        if (!res.ok) return false;
        const data = await res.json() as { canJoin: boolean };
        return data.canJoin === true;
    } catch {
        console.warn(`[discussion] access check timed out or failed for ${collectionType}:${topicId} — denying`);
        return false;
    } finally {
        clearTimeout(timer);
    }
}
// ─────────────────────────────────────────────────────────────────────────────

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

    // Discussion Support — gate on content visibility before joining the room.
    socket.on(SOCKET_EVENTS.DISCUSSION.JOIN, async (payload: { collectionType: string, topicId: string }) => {
        const { collectionType, topicId } = payload;
        if (!collectionType || !topicId) return;

        const canJoin = await checkDiscussionAccess(
            collectionType,
            topicId,
            String(user._id)
        );

        if (!canJoin) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Not authorized to join this discussion' });
            return;
        }

        socket.join(`discussion:${collectionType}:${topicId}`);
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

            // Also nudge every participant's personal `user:<id>` room so a client sitting
            // on the inbox LIST (which only joins `conversation:<id>` rooms for OPEN threads)
            // can invalidate + refetch and move the row live. Fire-and-forget: a background
            // lookup that never blocks or fails the message delivery above.
            notifyConversationUpdated(io, conversationId);
        }
    } catch (err) {
        console.warn('Socket IO not initialized yet, skipping message emission');
    }
};

// Fire-and-forget fan-out of `conversation:updated` to each participant's `user:<id>` room.
// `message:new` only reaches the `conversation:<id>` room (OPEN threads); this reaches
// participants who are connected but not viewing the thread (e.g. sitting on the inbox list).
const notifyConversationUpdated = (io: Server, conversationId: string) => {
    Conversation.findById(conversationId)
        .select('participants')
        .lean()
        .then((convo: any) => {
            if (!convo?.participants) return;
            for (const pid of convo.participants) {
                io.to(`user:${pid.toString()}`).emit(SOCKET_EVENTS.CONVERSATION.UPDATED, { conversationId });
            }
        })
        .catch((err: any) => console.warn('notifyConversationUpdated skipped:', err?.message));
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
