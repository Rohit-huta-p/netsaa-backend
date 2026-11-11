import { Socket } from 'socket.io';
import { SocketData, SOCKET_EVENTS } from './socket.types';
import Conversation from '../connections/conversations.model';

// Notes:
// - Presence is ephemeral state (not stored in DB).
// - Only conversation partners receive online/offline events, not all connected users.
// - Scalability: Redis Adapter propagates these room-scoped emits across instances.

/** Returns distinct partner user IDs for all conversations this user participates in. */
const getConversationPartnerIds = async (userId: string): Promise<string[]> => {
    const convos = await Conversation.find(
        { participants: userId },
        { participants: 1 }
    ).lean();
    const partners = new Set<string>();
    for (const convo of convos as any[]) {
        for (const pid of convo.participants) {
            const s = pid.toString();
            if (s !== userId) partners.add(s);
        }
    }
    return Array.from(partners);
};

export const handlePresenceConnection = (socket: Socket) => {
    const user = (socket.data as SocketData).user;
    if (!user) return;

    const userId = user._id.toString();

    // Join a room specific to this user
    socket.join(`user:${userId}`);

    // Notify only conversation partners that this user came online.
    // Fire-and-forget: a lookup failure must never crash the socket handler.
    getConversationPartnerIds(userId)
        .then(partnerIds => {
            for (const pid of partnerIds) {
                socket.to(`user:${pid}`).emit(SOCKET_EVENTS.PRESENCE.ONLINE, { userId });
            }
        })
        .catch(err => console.warn('[presence] online broadcast skipped:', err?.message));

    // Handle initial presence check from client
    socket.on(SOCKET_EVENTS.PRESENCE.CHECK, (payload: { userIds: string[] }) => {
        const onlineUserIds: string[] = [];
        if (payload.userIds && Array.isArray(payload.userIds)) {
            payload.userIds.forEach((uid) => {
                const room = socket.nsp.adapter.rooms.get(`user:${uid}`);
                if (room && room.size > 0) onlineUserIds.push(uid);
            });
        }
        socket.emit(SOCKET_EVENTS.PRESENCE.ONLINE_LIST, { onlineUserIds });
    });

    socket.on('disconnect', () => {
        // 5s grace period before broadcasting offline:
        // - covers mobile reconnects (background → foreground typically < 2s)
        // - covers multi-tab: if another socket still holds user:<userId>, skip entirely
        setTimeout(() => {
            const room = socket.nsp.adapter.rooms.get(`user:${userId}`);
            if (room && room.size > 0) return; // still connected elsewhere

            getConversationPartnerIds(userId)
                .then(partnerIds => {
                    for (const pid of partnerIds) {
                        socket.nsp.to(`user:${pid}`).emit(SOCKET_EVENTS.PRESENCE.OFFLINE, { userId });
                    }
                })
                .catch(err => console.warn('[presence] offline broadcast skipped:', err?.message));
        }, 5000);
    });
};
