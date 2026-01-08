import mongoose, { Schema, Document } from 'mongoose';
import { NotificationType } from './notification.types';

/**
 * Entity types represent the resource that the notification links to
 */
export type EntityType = 'gig' | 'event' | 'conversation' | 'contract';

/**
 * Channel configuration for multi-channel notification delivery
 * - inApp: Show in notification center (always true for user-facing notifications)
 * - push: Send push notification to mobile device
 * - email: Send email notification (optional)
 * - sms: Send SMS notification (optional)
 */
export interface INotificationChannel {
    inApp: boolean;
    push: boolean;
    email?: boolean;
    sms?: boolean;
}

/**
 * Deep-linking data for mobile app navigation
 * - route: The app route to navigate to (e.g., 'gig', 'event', 'chat')
 * - params: Route parameters (e.g., { gigId: '123' })
 */
export interface INotificationData {
    route: string;
    params?: Record<string, any>;
}

/**
 * Notification document interface
 * 
 * Design principles:
 * - User-centric: Each notification belongs to a single user
 * - Event-driven: Created in response to platform events
 * - Signal-based: Contains minimal data, not full entity snapshots
 * - Multi-channel: Supports in-app, push, email, and SMS delivery
 * - Deep-linkable: Contains routing data for mobile navigation
 */
export interface INotification extends Document {
    userId: mongoose.Types.ObjectId;
    actorId?: mongoose.Types.ObjectId;
    type: NotificationType;
    subtype: string;
    title: string;
    body: string;
    entityType?: EntityType;
    entityId?: mongoose.Types.ObjectId;
    data?: INotificationData;
    channel: INotificationChannel;
    readAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
    {
        // The user who receives this notification
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        // The user who triggered this notification (optional, e.g., for connection requests)
        actorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: false,
        },
        // Primary notification category
        type: {
            type: String,
            enum: Object.values(NotificationType),
            required: true,
        },
        // Specific notification subtype (e.g., 'connection_request', 'connection_accepted', 'new_message')
        subtype: {
            type: String,
            required: true,
        },
        // Notification title (displayed in notification center and push notifications)
        title: {
            type: String,
            required: true,
        },
        // Notification body text
        body: {
            type: String,
            required: true,
        },
        // Type of entity this notification relates to (optional)
        entityType: {
            type: String,
            enum: ['gig', 'event', 'conversation', 'contract'],
            required: false,
        },
        // ID of the related entity (optional)
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            required: false,
        },
        // Deep-linking data for mobile app navigation
        data: {
            route: {
                type: String,
                required: false,
            },
            params: {
                type: Schema.Types.Mixed,
                required: false,
            },
        },
        // Multi-channel delivery configuration
        channel: {
            inApp: {
                type: Boolean,
                required: true,
                default: true,
            },
            push: {
                type: Boolean,
                required: true,
                default: false,
            },
            email: {
                type: Boolean,
                required: false,
                default: false,
            },
            sms: {
                type: Boolean,
                required: false,
                default: false,
            },
        },
        // Timestamp when the notification was read (null = unread)
        readAt: {
            type: Date,
            required: false,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for fetching user's notifications sorted by creation date (most recent first)
// This is the primary query pattern for notification lists
NotificationSchema.index({ userId: 1, createdAt: -1 });

// Compound index for efficiently querying unread notifications
// Used for unread count calculations and filtering unread notifications
NotificationSchema.index({ userId: 1, readAt: 1 });

const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

export default Notification;
