import { Socket } from 'socket.io';
import { SocketData, SOCKET_EVENTS } from './socket.types';
import Conversation from '../connections/conversations.model';

export const joinConversation = async (socket: Socket, conversationId: string) => {
    try {
        const user = (socket.data as SocketData).user;
        if (!user) return;

        // Verify user is part of the conversation
        // SECURITY: We strictly validate against the DB that the requesting user is a participant.
        // This prevents unauthorized users from "guessing" room IDs and eavesdropping.
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: user._id
        });

        if (conversation) {
            await socket.join(`conversation:${conversationId}`);
            // console.log(`User ${user._id} joined conversation ${conversationId}`);

            // Initial Presence Check:
            // Iterate over other participants (max ~2 for DM) and check if they are online.
            if (conversation.participants) {
                // Ensure participants is populated or handle IDs
                const otherParticipantIds = conversation.participants
                    .map((p: any) => p._id ? p._id.toString() : p.toString())
                    .filter((id: string) => id !== user._id);

                otherParticipantIds.forEach((pid: string) => {
                    // Check if room 'user:{pid}' exists in socket adapter rooms
                    const room = socket.nsp.adapter.rooms.get(`user:${pid}`);
                    if (room && room.size > 0) {
                        // They are online
                        socket.emit(SOCKET_EVENTS.PRESENCE.ONLINE, { userId: pid });
                    }
                });
            }
        } else {
            socket.emit(SOCKET_EVENTS.ERROR, { message: 'Not authorized to join this conversation' });
        }
    } catch (error) {
        console.error('Error joining conversation:', error);
        socket.emit(SOCKET_EVENTS.ERROR, { message: 'Failed to join conversation' });
    }
};

export const leaveConversation = (socket: Socket, conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
};
