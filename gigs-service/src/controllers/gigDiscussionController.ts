import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Emitter } from '@socket.io/redis-emitter';
import Redis from 'ioredis';
import Gig from '../models/Gig';
import GigComment from '../models/GigComment';
import User from '../models/User';

// Setup Redis Emitter
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = new Redis(redisUrl);
const io = new Emitter(redisClient);

/**
 * GET /gigs/:gigId/discussion
 * Fetch discussion comments for a published gig.
 */
export const getGigDiscussion = async (req: Request, res: Response) => {
    try {
        const { gigId } = req.params;

        const gig = await Gig.findById(gigId);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        // Only allow discussion for published gigs
        if (gig.status !== 'published') {
            return res.status(403).json({ success: false, message: 'Discussion only available for published gigs' });
        }

        const comments = await GigComment.find({
            topicId: gigId,
            collectionType: 'gig'
        }).sort({ createdAt: 1 }); // Oldest first

        res.json({ success: true, data: comments });
    } catch (error: any) {
        console.error('Error fetching gig discussion:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch discussion' });
    }
};

/**
 * POST /gigs/:gigId/discussion
 * Add a comment to a gig discussion.
 */
export const addGigComment = async (req: Request, res: Response) => {
    try {
        const { gigId } = req.params;
        const { text } = req.body;
        const user = (req as any).user; // Assumes auth middleware populates user

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Comment text is required' });
        }

        const gig = await Gig.findById(gigId);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        if (gig.status !== 'published') {
            return res.status(403).json({ success: false, message: 'Cannot verify comment on unpublished gig' });
        }

        // Resolve author identity from the DB (authoritative + current), NOT the
        // JWT. The token carries a login-time profileImageUrl snapshot that goes
        // stale/empty when the user sets or changes their photo after login — the
        // old code only refreshed from the DB when the NAME was missing, so new
        // comments showed a placeholder (or the wrong avatar). JWT fields are the
        // fallback only if the lookup misses.
        const fullUser: any = await User.findById(user.id || user._id)
            .select('displayName firstName lastName profileImageUrl')
            .lean();
        const authorName =
            fullUser?.displayName ||
            `${fullUser?.firstName ?? ''} ${fullUser?.lastName ?? ''}`.trim() ||
            user.displayName || user.name || 'User';
        const authorImageUrl =
            fullUser?.profileImageUrl || user.profileImageUrl || user.imageUrl || user.avatarUrl || undefined;

        // Create Comment
        const comment = await GigComment.create({
            collectionType: 'gig',
            topicId: gigId,
            text: text,
            authorId: user.id,
            authorName: authorName,
            authorImageUrl: authorImageUrl,
        });

        // Emit Socket Event
        io.to(`discussion:gig:${gigId}`).emit('discussion:new', comment);

        res.status(201).json({ success: true, data: comment });
    } catch (error: any) {
        console.error('Error adding gig comment:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment' });
    }
};
