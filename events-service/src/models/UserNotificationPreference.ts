import mongoose, { Schema, Document, Model } from 'mongoose';

interface ChannelSet { push: boolean; email: boolean; sms: boolean; }
export interface IUserNotificationPreference extends Document {
  userId: mongoose.Types.ObjectId;
  reminders: ChannelSet;
  announcements: ChannelSet;
  reviews: ChannelSet;
  createdAt: Date; updatedAt: Date;
}

const channel = (smsDefault: boolean) => ({
  push: { type: Boolean, default: true },
  email: { type: Boolean, default: true },
  sms: { type: Boolean, default: smsDefault },
});

const schema = new Schema<IUserNotificationPreference>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  reminders: channel(true),       // SMS on for reminders (T-2h etc.)
  announcements: channel(false),
  reviews: channel(false),
}, { timestamps: true });

schema.index({ userId: 1 }, { unique: true });

const UserNotificationPreference: Model<IUserNotificationPreference> =
  mongoose.model<IUserNotificationPreference>('UserNotificationPreference', schema);
export default UserNotificationPreference;

export const DEFAULT_PREFERENCES = {
  reminders: { push: true, email: true, sms: true },
  announcements: { push: true, email: true, sms: false },
  reviews: { push: true, email: true, sms: false },
};
