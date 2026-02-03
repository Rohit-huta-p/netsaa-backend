/**
 * Notification Controller
 * 
 * Handles HTTP requests for notification management.
 * All endpoints require authentication and enforce user ownership.
 * 
 * Endpoints:
 * - GET /notifications - List user's notifications with pagination
 * - PATCH /notifications/:id/read - Mark single notification as read
 * - PATCH /notifications/read-all - Mark all notifications as read
 * - GET /notifications/unread-count - Get unread notification count
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { notificationService } from './notification.service';

/**
 * @desc    Get user's notifications with pagination
 * @route   GET /api/users/notifications
 * @access  Private
 */
export const getNotifications = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        console.log("User: ", req.user);
        const userId = req.user?._id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
            });
        }

        // Parse query parameters
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = parseInt(req.query.pageSize as string) || 20;
        const unreadOnly = req.query.unreadOnly === 'true';
        const type = req.query.type as string | undefined;

        // Validate pagination
        if (page < 1 || pageSize < 1 || pageSize > 100) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pagination parameters',
            });
        }

        // Get notifications
        const result = await notificationService.getUserNotifications({
            userId,
            page,
            limit: pageSize,
            unreadOnly,
            type,
        });

        res.status(200).json({
            success: true,
            data: result.notifications,
            pagination: result.pagination,
        });

    } catch (error) {
        console.error('[NotificationController] Error getting notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
};

/**
 * @desc    Mark a notification as read
 * @route   PATCH /api/users/notifications/:id/read
 * @access  Private
 */
export const markAsRead = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        const notificationId = req.params.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
            });
        }

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Notification ID required',
            });
        }

        // Mark as read (service handles authorization)
        const notification = await notificationService.markAsRead(
            notificationId,
            userId
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found or already read',
            });
        }

        res.status(200).json({
            success: true,
            data: notification,
            message: 'Notification marked as read',
        });

    } catch (error) {
        console.error('[NotificationController] Error marking as read:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
};

/**
 * @desc    Mark all notifications as read
 * @route   PATCH /api/users/notifications/read-all
 * @access  Private
 */
export const markAllAsRead = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
            });
        }

        // Optional: only mark notifications before a certain date
        const beforeDate = req.body.beforeDate
            ? new Date(req.body.beforeDate)
            : undefined;

        // Mark all as read
        const count = await notificationService.markAllAsRead(userId, beforeDate);

        res.status(200).json({
            success: true,
            data: { count },
            message: `${count} notification(s) marked as read`,
        });

    } catch (error) {
        console.error('[NotificationController] Error marking all as read:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
};

/**
 * @desc    Get unread notification count
 * @route   GET /api/users/notifications/unread-count
 * @access  Private
 */
export const getUnreadCount = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
            });
        }

        // Optional: filter by type
        const type = req.query.type as string | undefined;

        // Get unread count
        const count = await notificationService.getUnreadCount(userId, type);

        res.status(200).json({
            success: true,
            data: { count },
        });

    } catch (error) {
        console.error('[NotificationController] Error getting unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
};

/**
 * @desc    Get unread counts grouped by type
 * @route   GET /api/users/notifications/unread-counts-by-type
 * @access  Private
 */
export const getUnreadCountsByType = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
            });
        }

        // Get counts grouped by type
        const counts = await notificationService.getUnreadCountsByType(userId);

        res.status(200).json({
            success: true,
            data: counts,
        });

    } catch (error) {
        console.error('[NotificationController] Error getting counts by type:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /api/users/notifications/:id
 * @access  Private
 */
export const deleteNotification = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const userId = req.user?.id;
        const notificationId = req.params.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized',
            });
        }

        if (!notificationId) {
            return res.status(400).json({
                success: false,
                message: 'Notification ID required',
            });
        }

        // Delete notification (service handles authorization)
        const deleted = await notificationService.deleteNotification(
            notificationId,
            userId
        );

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Notification deleted',
        });

    } catch (error) {
        console.error('[NotificationController] Error deleting notification:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
};
