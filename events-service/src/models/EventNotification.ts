import mongoose, { Schema, Document, Model } from 'mongoose';

export type NotificationKind =
    | 'confirmation'         // sent at registration time
    | 'reminder_t7d'
    | 'reminder_t24h'
    | 'reminder_t2h'
    | 'waitlist_promoted'
    | 'reschedule'
    | 'cancellation'
    | 'refund_processed'
    | 'review_prompt'
    | 'announcement';        // organizer-authored

export type NotificationChannel = 'push' | 'email' | 'sms';

export type NotificationAudience = 'all' | 'confirmed' | 'waitlisted' | 'vip' | 'custom';

export type NotificationStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface IEventNotification extends Document {
    eventId: mongoose.Types.ObjectId;
    kind: NotificationKind;
    channels: NotificationChannel[];     // multi-channel fan-out
    audience: NotificationAudience;
    customAudienceUserIds?: mongoose.Types.ObjectId[]; // when audience='custom'

    subject?: string;                    // email subject
    body: string;                        // shared body across channels (channel-specific overrides via templating)

    scheduledAt: Date;                   // when to fire (now for immediate)
    sentAt?: Date;
    status: NotificationStatus;

    sentCount: number;
    failedCount: number;

    initiatedBy?: mongoose.Types.ObjectId; // null for system reminders, organizer userId for announcements
    lastErrorMessage?: string;

    createdAt: Date;
    updatedAt: Date;
}

const eventNotificationSchema = new Schema<IEventNotification>(
    {
        eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
        kind: {
            type: String,
            enum: [
                'confirmation',
                'reminder_t7d',
                'reminder_t24h',
                'reminder_t2h',
                'waitlist_promoted',
                'reschedule',
                'cancellation',
                'refund_processed',
                'review_prompt',
                'announcement',
            ],
            required: true,
        },
        channels: {
            type: [{ type: String, enum: ['push', 'email', 'sms'] }],
            required: true,
        },
        audience: {
            type: String,
            enum: ['all', 'confirmed', 'waitlisted', 'vip', 'custom'],
            required: true,
        },
        customAudienceUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],

        subject: { type: String },
        body: { type: String, required: true },

        scheduledAt: { type: Date, required: true },
        sentAt: { type: Date },
        status: {
            type: String,
            enum: ['queued', 'sending', 'sent', 'failed', 'cancelled'],
            default: 'queued',
        },

        sentCount: { type: Number, default: 0 },
        failedCount: { type: Number, default: 0 },

        initiatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        lastErrorMessage: { type: String },
    },
    { timestamps: true }
);

// Indexes
eventNotificationSchema.index({ eventId: 1, kind: 1 });                       // duplicate-reminder check
eventNotificationSchema.index({ status: 1, scheduledAt: 1 });                 // queue worker
eventNotificationSchema.index({ eventId: 1, status: 1 });                     // event activity log
eventNotificationSchema.index({ initiatedBy: 1, kind: 1, createdAt: -1 });    // organizer announcement rate limit

const EventNotification: Model<IEventNotification> = mongoose.model<IEventNotification>(
    'EventNotification',
    eventNotificationSchema
);

export default EventNotification;
