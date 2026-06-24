import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  participants: mongoose.Types.ObjectId[];
  lastMessage?: string;
  lastMessageAt?: Date;
  // Anchored to a requirement + chosen proposal (client onboarding Part A),
  // or to an accepted invite (Part B context-free accept).
  context?: { requirementId?: mongoose.Types.ObjectId; proposalId?: mongoose.Types.ObjectId; label?: string; inviteId?: mongoose.Types.ObjectId };
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
    context: {
      requirementId: { type: Schema.Types.ObjectId },
      proposalId: { type: Schema.Types.ObjectId },
      label: { type: String },
      inviteId: { type: Schema.Types.ObjectId },
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
