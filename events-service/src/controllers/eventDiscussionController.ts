import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Emitter } from '@socket.io/redis-emitter';
import Redis from 'ioredis';
import Event from '../models/Event';
import EventComment from '../models/EventComment';
import User from '../models/User';

// Setup Redis Emitter
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = new Redis(redisUrl);
const io = new Emitter(redisClient);

/**
 * GET /events/:eventId/discussion
 * Fetch discussion comments for a published event.
 */
export const getEventDiscussion = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;

        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        // Only allow discussion for published events
        if (event.status !== 'published') {
            return res.status(403).json({ success: false, message: 'Discussion only available for published events' });
        }

        const comments = await EventComment.find({
            topicId: eventId,
            collectionType: 'event'
        }).sort({ createdAt: 1 }); // Oldest first

        res.json({ success: true, data: comments });
    } catch (error: any) {
        console.error('Error fetching event discussion:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch discussion' });
    }
};

/**
 * POST /events/:eventId/discussion
 * Add a comment to an event discussion.
 */
export const addEventComment = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;
        const { text } = req.body;
        const user = (req as any).user; // Assumes auth middleware populates user

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Comment text is required' });
        }

        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        if (event.status !== 'published') {
            return res.status(403).json({ success: false, message: 'Cannot verify comment on unpublished event' });
        }
        let authorName = user.name || user.displayName || `${user.firstName} ${user.lastName}`;
        let authorImageUrl = user.profileImageUrl || user.imageUrl || user.avatarUrl;

        // If user details are missing (e.g. only ID verified), fetch from DB
        if (!authorName || authorName.replace('undefined undefined', '').trim() === '') {
            const fullUser = await User.findById(user.id);
            if (fullUser) {
                authorName = fullUser.displayName || `${(fullUser as any).firstName} ${(fullUser as any).lastName}` || 'User';
                authorImageUrl = fullUser.profileImageUrl;
            }
        }

        // Create Comment
        const comment = await EventComment.create({
            collectionType: 'event',
            topicId: eventId,
            text: text,
            authorId: user.id,
            authorName: authorName,
            authorImageUrl: authorImageUrl,
        });

        // Emit Socket Event
        // Structure: discussion:new
        // Room: discussion:event:{eventId}
        io.to(`discussion:event:${eventId}`).emit('discussion:new', comment);

        res.status(201).json({ success: true, data: comment });
    } catch (error: any) {
        console.error('Error adding event comment:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment' });
    }
};
