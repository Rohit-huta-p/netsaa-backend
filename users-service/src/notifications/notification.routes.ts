/**
 * Notification Routes
 * 
 * Defines HTTP routes for notification management.
 * All routes require authentication via protect middleware.
 */

import express from 'express';
import { protect } from '../middleware/auth';
import {
    getNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
    getUnreadCountsByType,
    deleteNotification,
} from './notification.controller';

const router = express.Router();

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/users/notifications
 * @desc    Get user's notifications with pagination
 * @access  Private
 * @query   page - Page number (default: 1)
 * @query   pageSize - Items per page (default: 20, max: 100)
 * @query   unreadOnly - Filter unread only (default: false)
 * @query   type - Filter by notification type (optional)
 */
router.get('/', getNotifications);

/**
 * @route   GET /api/users/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 * @query   type - Filter by notification type (optional)
 */
router.get('/unread-count', getUnreadCount);

/**
 * @route   GET /api/users/notifications/unread-counts-by-type
 * @desc    Get unread counts grouped by notification type
 * @access  Private
 */
router.get('/unread-counts-by-type', getUnreadCountsByType);

/**
 * @route   PATCH /api/users/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 * @body    beforeDate - Optional: only mark notifications before this date
 */
router.patch('/read-all', markAllAsRead);

/**
 * @route   PATCH /api/users/notifications/:id/read
 * @desc    Mark a single notification as read
 * @access  Private
 * @param   id - Notification ID
 */
router.patch('/:id/read', markAsRead);

/**
 * @route   DELETE /api/users/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 * @param   id - Notification ID
 */
router.delete('/:id', deleteNotification);

export default router;
