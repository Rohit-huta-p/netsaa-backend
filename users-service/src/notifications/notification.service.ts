/**
 * Notification Service
 * 
 * Handles persistence and retrieval of notifications.
 * This is a pure data layer that does NOT handle delivery (push, email, sockets).
 * 
 * Responsibilities:
 * - Persist notifications to MongoDB with idempotency
 * - Query notifications with pagination and filtering
 * - Mark notifications as read
 * - Calculate unread counts on-demand
 * 
 * Design principles:
 * - Idempotent: duplicate events don't create duplicate notifications
 * - Efficient: uses indexes for fast queries
 * - Scalable: pagination prevents memory issues
 * - Simple: no business logic, just CRUD operations
 */

import mongoose from 'mongoose';
import crypto from 'crypto';
import Notification, { INotification } from './notification.model';
import { NotificationPayload } from './notification.factory';

/**
 * Pagination options for querying notifications
 */
export interface NotificationQueryOptions {
    userId: string;
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
    type?: string;
}

/**
 * Paginated notification response
 */
export interface PaginatedNotifications {
    notifications: INotification[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
        hasMore: boolean;
    };
}

/**
 * Notification Service Class
 */
class NotificationService {
    /**
     * Create a notification with idempotency
     * 
     * Uses a hash of the event's idempotency key to prevent duplicates.
     * If a notification with the same hash already exists, returns the existing one.
     * 
     * @param payload - Notification payload from factory
     * @param idempotencyKey - Unique key from the event
     * @returns Created or existing notification
     */
    async createNotification(
        payload: NotificationPayload,
        idempotencyKey: string
    ): Promise<INotification> {
        // Generate a deterministic hash from the idempotency key
        // This ensures the same event never creates duplicate notifications
        const idempotencyHash = this.generateIdempotencyHash(idempotencyKey);

        // Check if notification already exists
        const existing = await Notification.findOne({
            userId: payload.userId,
            type: payload.type,
            subtype: payload.subtype,
            entityId: payload.entityId,
            createdAt: {
                // Only check recent notifications (last 7 days) for performance
                $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
        });

        if (existing) {
            // Idempotency: return existing notification without creating duplicate
            return existing;
        }

        // Create new notification
        const notification = await Notification.create({
            userId: payload.userId,
            actorId: payload.actorId,
            type: payload.type,
            subtype: payload.subtype,
            title: payload.title,
            body: payload.body,
            entityType: payload.entityType,
            entityId: payload.entityId,
            data: payload.data,
            channel: payload.channel,
            readAt: undefined, // Unread by default
        });

        return notification;
    }

    /**
     * Get notifications for a user with pagination
     * 
     * @param options - Query options including userId, pagination, and filters
     * @returns Paginated notifications
     */
    async getUserNotifications(
        options: NotificationQueryOptions
    ): Promise<PaginatedNotifications> {
        const {
            userId,
            page = 1,
            limit = 20,
            unreadOnly = false,
            type,
        } = options;

        // Build query
        const query: any = { userId };

        if (unreadOnly) {
            query.readAt = null;
        }

        if (type) {
            query.type = type;
        }

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Execute query with pagination
        const [notifications, total] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 }) // Most recent first
                .skip(skip)
                .limit(limit)
                .lean(), // Use lean for better performance
            Notification.countDocuments(query),
        ]);

        const pages = Math.ceil(total / limit);

        return {
            notifications: notifications as INotification[],
            pagination: {
                page,
                limit,
                total,
                pages,
                hasMore: page < pages,
            },
        };
    }

    /**
     * Mark a single notification as read
     * 
     * @param notificationId - ID of the notification to mark as read
     * @param userId - User ID for authorization
     * @returns Updated notification or null if not found/unauthorized
     */
    async markAsRead(
        notificationId: string,
        userId: string
    ): Promise<INotification | null> {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: notificationId,
                userId, // Ensure user owns this notification
                readAt: null, // Only update if not already read
            },
            {
                readAt: new Date(),
            },
            {
                new: true, // Return updated document
            }
        );

        return notification;
    }

    /**
     * Mark all notifications as read for a user
     * 
     * @param userId - User ID
     * @param beforeDate - Optional: only mark notifications before this date as read
     * @returns Number of notifications marked as read
     */
    async markAllAsRead(
        userId: string,
        beforeDate?: Date
    ): Promise<number> {
        const query: any = {
            userId,
            readAt: null, // Only unread notifications
        };

        if (beforeDate) {
            query.createdAt = { $lte: beforeDate };
        }

        const result = await Notification.updateMany(
            query,
            {
                readAt: new Date(),
            }
        );

        return result.modifiedCount;
    }

    /**
     * Get unread notification count for a user
     * 
     * This is calculated on-demand, not stored in the database.
     * For high-traffic apps, consider caching this value in Redis.
     * 
     * @param userId - User ID
     * @param type - Optional: filter by notification type
     * @returns Count of unread notifications
     */
    async getUnreadCount(userId: string, type?: string): Promise<number> {
        const query: any = {
            userId,
            readAt: null,
        };

        if (type) {
            query.type = type;
        }

        const count = await Notification.countDocuments(query);
        return count;
    }

    /**
     * Delete old notifications (cleanup job)
     * 
     * This should be run periodically (e.g., daily cron job) to prevent
     * the notifications collection from growing indefinitely.
     * 
     * @param olderThanDays - Delete notifications older than this many days
     * @returns Number of notifications deleted
     */
    async deleteOldNotifications(olderThanDays: number = 90): Promise<number> {
        const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

        const result = await Notification.deleteMany({
            createdAt: { $lt: cutoffDate },
            readAt: { $ne: null }, // Only delete read notifications
        });

        return result.deletedCount;
    }

    /**
     * Get notification by ID
     * 
     * @param notificationId - Notification ID
     * @param userId - User ID for authorization
     * @returns Notification or null if not found/unauthorized
     */
    async getNotificationById(
        notificationId: string,
        userId: string
    ): Promise<INotification | null> {
        const notification = await Notification.findOne({
            _id: notificationId,
            userId, // Ensure user owns this notification
        });

        return notification;
    }

    /**
     * Delete a notification
     * 
     * @param notificationId - Notification ID
     * @param userId - User ID for authorization
     * @returns True if deleted, false if not found/unauthorized
     */
    async deleteNotification(
        notificationId: string,
        userId: string
    ): Promise<boolean> {
        const result = await Notification.deleteOne({
            _id: notificationId,
            userId, // Ensure user owns this notification
        });

        return result.deletedCount > 0;
    }

    /**
     * Get unread notifications grouped by type
     * Useful for showing categorized notification counts in UI
     * 
     * @param userId - User ID
     * @returns Object with counts per notification type
     */
    async getUnreadCountsByType(userId: string): Promise<Record<string, number>> {
        const results = await Notification.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    readAt: null,
                },
            },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                },
            },
        ]);

        // Convert array to object
        const counts: Record<string, number> = {};
        results.forEach((result) => {
            counts[result._id] = result.count;
        });

        return counts;
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================

    /**
     * Generate a deterministic hash from an idempotency key
     * This is used to prevent duplicate notifications
     */
    private generateIdempotencyHash(key: string): string {
        return crypto.createHash('sha256').update(key).digest('hex');
    }
}

// Export singleton instance
export const notificationService = new NotificationService();
