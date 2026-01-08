import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  participants: mongoose.Types.ObjectId[];
  lastMessage?: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema: Schema = new Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: String,
      required: false,
    },
    lastMessageAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);

export default Conversation;
