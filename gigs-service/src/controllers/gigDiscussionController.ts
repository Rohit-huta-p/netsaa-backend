import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Emitter } from '@socket.io/redis-emitter';
import Redis from 'ioredis';
import Gig from '../models/Gig';
import GigComment from '../models/GigComment';
import User from '../models/User';
import { normalizeRole, canApply } from '../utils/roleVisibility';

// Setup Redis Emitter
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = new Redis(redisUrl);
const io = new Emitter(redisClient);

// Max comments an owner can pin per gig (matches the FE "Pin (max 3)" copy).
const PIN_CAP = 3;

const isGigOwner = (gig: any, userId?: string) =>
    !!userId && String(gig.organizerId) === String(userId);

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
        }).sort({ isPinned: -1, createdAt: 1 }); // Pinned first, then oldest

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
        const { text, parentId } = req.body;
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

        // Three-role wall on POSTING (reading stays open — gig detail is
        // intentionally shareable). The gig owner, or anyone whose role could
        // apply to this gig, may post; an ineligible role (e.g. an artist on a
        // client's gig) is blocked — same rule as applyToGig.
        if (!isGigOwner(gig, user.id || user._id) && !canApply(normalizeRole(user.role), gig.posterRole)) {
            return res.status(403).json({ success: false, message: 'Your role cannot post in this discussion' });
        }

        // Threading (flat, one level). A reply carries the id of the comment it
        // replies to; we coerce it to the THREAD ROOT so a reply can never parent
        // another reply. The parent must be a comment on this same gig.
        let resolvedParentId: mongoose.Types.ObjectId | null = null;
        if (parentId) {
            if (!mongoose.Types.ObjectId.isValid(parentId)) {
                return res.status(400).json({ success: false, message: 'Invalid parent comment id' });
            }
            const parent = await GigComment.findOne({
                _id: parentId,
                topicId: gigId,
                collectionType: 'gig',
            });
            if (!parent) {
                return res.status(400).json({ success: false, message: 'Parent comment not found' });
            }
            resolvedParentId = (parent.parentId ?? parent._id) as mongoose.Types.ObjectId;
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
            parentId: resolvedParentId,
        });

        // Emit Socket Event
        io.to(`discussion:gig:${gigId}`).emit('discussion:new', comment);

        res.status(201).json({ success: true, data: comment });
    } catch (error: any) {
        console.error('Error adding gig comment:', error);
        res.status(500).json({ success: false, message: 'Failed to add comment' });
    }
};

/**
 * PUT /gigs/:gigId/discussion/:commentId/pin
 * Toggle pin on a comment. Owner-only. Caps pinned comments at PIN_CAP — when
 * exceeded, the oldest pinned comment is unpinned (and its own pin event emitted
 * so every client reconciles).
 */
export const togglePinGigComment = async (req: Request, res: Response) => {
    try {
        const { gigId, commentId } = req.params;
        const user = (req as any).user;

        const gig = await Gig.findById(gigId);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }
        if (!isGigOwner(gig, user.id || user._id)) {
            return res.status(403).json({ success: false, message: 'Only the gig owner can pin comments' });
        }

        const comment = await GigComment.findOne({ _id: commentId, topicId: gigId, collectionType: 'gig' });
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }
        if (comment.isDeleted) {
            return res.status(400).json({ success: false, message: 'Cannot pin a deleted comment' });
        }

        const willPin = !comment.isPinned;

        if (willPin) {
            // Enforce the cap: if already at PIN_CAP, unpin the oldest pinned.
            const pinned = await GigComment.find({
                topicId: gigId,
                collectionType: 'gig',
                isPinned: true,
            }).sort({ pinnedAt: 1 });
            if (pinned.length >= PIN_CAP) {
                const oldest = pinned[0];
                oldest.isPinned = false;
                oldest.pinnedAt = undefined;
                oldest.pinnedBy = undefined;
                await oldest.save();
                io.to(`discussion:gig:${gigId}`).emit('discussion:pin', {
                    _id: oldest._id,
                    isPinned: false,
                    pinnedAt: null,
                    pinnedBy: null,
                });
            }
            comment.isPinned = true;
            comment.pinnedAt = new Date();
            comment.pinnedBy = (user.id || user._id) as any;
        } else {
            comment.isPinned = false;
            comment.pinnedAt = undefined;
            comment.pinnedBy = undefined;
        }

        await comment.save();

        io.to(`discussion:gig:${gigId}`).emit('discussion:pin', {
            _id: comment._id,
            isPinned: comment.isPinned,
            pinnedAt: comment.pinnedAt ?? null,
            pinnedBy: comment.pinnedBy ?? null,
        });

        res.json({ success: true, data: comment });
    } catch (error: any) {
        console.error('Error toggling pin on gig comment:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle pin' });
    }
};

/**
 * DELETE /gigs/:gigId/discussion/:commentId
 * Soft-delete a comment: author, gig owner, or admin. Body is masked to
 * "[deleted]" and the thread keeps its order. Records who removed it.
 */
export const deleteGigComment = async (req: Request, res: Response) => {
    try {
        const { gigId, commentId } = req.params;
        const user = (req as any).user;
        const userId = user.id || user._id;

        const gig = await Gig.findById(gigId);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        const comment = await GigComment.findOne({ _id: commentId, topicId: gigId, collectionType: 'gig' });
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }
        if (comment.isDeleted) {
            return res.json({ success: true, data: comment }); // already gone — idempotent
        }

        const isAuthor = String(comment.authorId) === String(userId);
        const isOwner = isGigOwner(gig, userId);
        const isAdmin = normalizeRole(user.role) === 'admin';
        if (!isAuthor && !isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not allowed to remove this comment' });
        }

        comment.isDeleted = true;
        comment.deletedAt = new Date();
        comment.deletedReason = isAuthor ? 'self' : isOwner ? 'organizer' : 'admin';
        comment.text = '[deleted]';
        comment.isPinned = false;
        comment.pinnedAt = undefined;
        comment.pinnedBy = undefined;
        await comment.save();

        io.to(`discussion:gig:${gigId}`).emit('discussion:delete', {
            _id: comment._id,
            isDeleted: true,
            deletedAt: comment.deletedAt,
            deletedReason: comment.deletedReason,
            text: comment.text,
            isPinned: false,
        });

        res.json({ success: true, data: comment });
    } catch (error: any) {
        console.error('Error deleting gig comment:', error);
        res.status(500).json({ success: false, message: 'Failed to delete comment' });
    }
};
