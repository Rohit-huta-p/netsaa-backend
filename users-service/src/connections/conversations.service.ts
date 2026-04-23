import mongoose from 'mongoose';
import Conversation from './conversations.model';
import Message from './messages.model';

class ConversationsService {
    async listUserConversations(userId: string) {
        const conversations = await Conversation.find({
            participants: userId,
        })
            .sort({ lastMessageAt: -1 })
            .populate('participants', 'username email firstName lastName profilePicture');

        if (conversations.length === 0) {
            return [];
        }

        // Compute unreadCount per conversation for this user.
        // A message is "unread" for this user if:
        //   - it was not sent by this user (senderId != userId), AND
        //   - this user is not in the seenBy array.
        // We use a single aggregation keyed by conversationId to avoid N+1 queries.
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const conversationIds = conversations.map((c) => c._id);

        const unreadAgg = await Message.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
            {
                $match: {
                    conversationId: { $in: conversationIds },
                    senderId: { $ne: userObjectId },
                    seenBy: { $ne: userObjectId },
                },
            },
            {
                $group: {
                    _id: '$conversationId',
                    count: { $sum: 1 },
                },
            },
        ]);

        const unreadMap = new Map<string, number>();
        for (const row of unreadAgg) {
            unreadMap.set(row._id.toString(), row.count);
        }

        // Merge unreadCount into each conversation without mutating Mongoose internals.
        return conversations.map((conv) => {
            const plain = conv.toObject();
            return {
                ...plain,
                unreadCount: unreadMap.get(conv._id.toString()) ?? 0,
            };
        });
    }

    // Note: This method might be redundant if MessagesService updates conversation directly,
    // but keeping it valid against the schema just in case.
    async updateLastMessage(conversationId: string, message: any) {
        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessageAt: message.createdAt,
            // Schema mismatch fix: 'lastMessageContent' does not exist in model.
            // Using 'lastMessage' string as defined in conversations.model.ts
            lastMessage: message.text || 'Attachment',
        });
    }

    async createConversation(userId: string, recipientId: string) {
        // Check if exists
        const existing = await Conversation.findOne({
            participants: { $all: [userId, recipientId] }
        }).populate('participants', 'username email firstName lastName profilePicture');

        if (existing) return existing;

        const conversation = await Conversation.create({
            participants: [userId, recipientId],
            lastMessageAt: new Date()
        });

        return conversation.populate('participants', 'username email firstName lastName profilePicture');
    }

    async getConversationById(id: string) {
        return Conversation.findById(id)
            .populate('participants', 'username email firstName lastName profilePicture');
    }
}

export default new ConversationsService();
