import Conversation from './conversations.model';

class ConversationsService {
    async listUserConversations(userId: string) {
        const conversations = await Conversation.find({
            participants: userId,
        })
            .sort({ lastMessageAt: -1 })
            .populate('participants', 'username email firstName lastName displayName profilePicture profileImageUrl');

        return conversations;
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
        }).populate('participants', 'username email firstName lastName displayName profilePicture profileImageUrl');

        if (existing) return existing;

        const conversation = await Conversation.create({
            participants: [userId, recipientId],
            lastMessageAt: new Date()
        });

        return conversation.populate('participants', 'username email firstName lastName displayName profilePicture profileImageUrl');
    }

    async getConversationById(id: string) {
        return Conversation.findById(id)
            .populate('participants', 'username email firstName lastName displayName profilePicture profileImageUrl');
    }
}

export default new ConversationsService();
