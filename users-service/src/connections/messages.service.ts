import mongoose from 'mongoose';
import Message, { IMessage } from './messages.model';
import Conversation from './conversations.model';
import Connection from './connections.model'; // Need this to validate connection status
import { notificationEvents } from '../notifications';

class MessagesService {
    async sendMessage({
        conversationId,
        senderId,
        text,
        attachments,
        clientMessageId,
    }: {
        conversationId: string;
        senderId: string;
        text?: string;
        attachments?: any[];
        clientMessageId?: string;
    }) {
        // 1. Validate inputs
        if (!text && (!attachments || attachments.length === 0)) {
            throw new Error('Message must contain text or attachments.');
        }

        // 2. Validate Conversation and Participation
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            throw new Error('Conversation not found.');
        }

        const isParticipant = conversation.participants.some(
            (p) => p.toString() === senderId
        );

        if (!isParticipant) {
            throw new Error('You are not a participant in this conversation.');
        }

        // 3. Validate Connection Status
        // Identify the other participant
        const otherParticipantId = conversation.participants.find(
            (p) => p.toString() !== senderId
        );

        if (!otherParticipantId) {
            throw new Error('Invalid conversation: only one participant found.');
        }

        const connection = await Connection.findOne({
            $or: [
                { requesterId: senderId, recipientId: otherParticipantId },
                { requesterId: otherParticipantId, recipientId: senderId },
            ],
            status: 'accepted',
        });

        if (!connection) {
            throw new Error('Cannot send message. Connection is not active.');
        }

        // 4. Enforce Idempotency
        // Why this is needed: Mobile clients often have flaky connections and will retry sending
        // the same message multiple times. To prevent duplicate messages in the chat, we check
        // if a message with this unique client-generated ID already exists.
        if (clientMessageId) {
            const existingMessage = await Message.findOne({ clientMessageId });
            if (existingMessage) {
                // Return existing message so client thinks it succeeded.
                // This ensures retried sends do not create duplicates.
                return existingMessage;
            }
        }

        // 5. Create Message
        // We create the message BEFORE trying to update the conversation summary.
        // This is the source of truth for the chat history.
        const message = await Message.create({
            conversationId,
            senderId,
            text,
            attachments,
            seenBy: [senderId], // Sender has implicitly seen it
            clientMessageId,
        });

        // 6. Update Conversation (Fire and Forget / Best Effort)
        try {
            await Conversation.findByIdAndUpdate(conversationId, {
                lastMessage: text || 'Attachment',
                lastMessageAt: message.createdAt,
            });
        } catch (error) {
            // Why partial failure is acceptable:
            // 1. The message itself is successfully saved (step 5). Deleting it now would cause data loss.
            // 2. The Conversation.lastMessage is an optimization for list views. It is acceptable for it
            //    to be temporarily out of sync (eventual consistency) rather than losing the actual message.
            // 3. We assume mobile clients will retry aggressively, so we must never rollback a successful
            //    message creation just because the metadata update failed.
            console.error(
                `Failed to update conversation ${conversationId} for message ${message._id}:`,
                error
            );
        }

        // 7. Emit event for notification system (fire-and-forget)
        // Calculate recipient IDs (all participants except sender)
        const recipientIds = conversation.participants
            .filter((p) => p.toString() !== senderId)
            .map((p) => p.toString());

        notificationEvents.emitMessageSent({
            conversationId: conversationId,
            messageId: message._id.toString(),
            senderId: senderId,
            recipientIds: recipientIds,
            messagePreview: text ? text.substring(0, 100) : 'Sent an attachment',
            hasAttachments: !!(attachments && attachments.length > 0),
        });

        return message;
    }

    async getMessages(
        conversationId: string,
        userId: string,
        cursor?: string, // createdAt timestamp string
        limit: number = 30
    ) {
        // 1. Validate Access
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            throw new Error('Conversation not found.');
        }

        const isParticipant = conversation.participants.some(
            (p) => p.toString() === userId
        );

        if (!isParticipant) {
            throw new Error('Not authorized to view messages in this conversation.');
        }

        // 2. Build Query
        const query: any = { conversationId };

        if (cursor) {
            query.createdAt = { $lt: new Date(cursor) };
        }

        // 3. Fetch Messages (Sorted Old -> New? usually pagination is New -> Old for fetching history)
        // Request said: "Return messages sorted ASC (old → new)"
        // Typically for chat history we fetch the latest N messages.
        // If sorting ASC (old->new), limit usually applies to the END of the list?
        // Let's stick to standard practice:
        // If cursor is provided (scrolling UP), we want messages OLDER than cursor.
        // So we sort DESC by createdAt to get the nearest previous messages, then reverse appropriately?
        // OR: "Return messages sorted ASC" means the output list.
        // Query should probably sort DESC to get "latest before cursor", then we reverse the array to return ASC.

        const messages = await Message.find(query)
            .sort({ createdAt: -1 }) // Get newest first relative to cursor
            .limit(limit);

        // Reverse to return Old -> New
        return messages.reverse();
    }

    async markMessagesSeen(conversationId: string, userId: string) {
        // 1. Mark all messages in this conversation NOT sent by user as seen
        // "Read receipts must be safe to retry": $addToSet ensures idempotency.
        // If the client sends this request multiple times, the userId is only added once.
        const result = await Message.updateMany(
            {
                conversationId,
                senderId: { $ne: userId }, // Not sent by me
                seenBy: { $ne: userId },   // Not already seen by me
            },
            {
                $addToSet: { seenBy: userId },
            }
        );

        return {
            seenCount: result.modifiedCount,
        };
    }
}

export default new MessagesService();
