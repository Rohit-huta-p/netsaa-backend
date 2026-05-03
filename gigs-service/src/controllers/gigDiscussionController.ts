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
 * Pin cap (Q2 → b). Owner can keep up to 3 pinned at a time. When a 4th is
 * pinned, the oldest pinned comment auto-unpins. Cap is enforced per-gig.
 */
const PIN_CAP = 3;

/**
 * Mask text on soft-deleted comments. Backend always returns the masked body
 * so the original text never reaches non-admin clients. Admin moderation UI
 * (separate surface) can fetch raw text via a dedicated endpoint if needed.
 */
const DELETED_MASK = '[deleted]';

function applyDeletedMask(comment: any) {
    if (!comment) return comment;
    if (!comment.isDeleted) return comment;
    const obj = typeof comment.toObject === 'function' ? comment.toObject() : { ...comment };
    obj.text = DELETED_MASK;
    return obj;
}

/**
 * Resolve the gig owner's ObjectId. Gigs may store organizerId as ObjectId or
 * as a populated subdoc — handle both. Returns null if unresolvable.
 */
function resolveOrganizerId(gig: any): string | null {
    if (!gig?.organizerId) return null;
    const raw = gig.organizerId._id ?? gig.organizerId;
    return raw ? String(raw) : null;
}

/**
 * GET /gigs/:gigId/discussion
 * Fetch discussion comments for a published gig. Sorted pinned-first, then
 * chronological (oldest first within each group). Soft-deleted comments are
 * returned with text masked but stay in the thread to preserve continuity.
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

        // Pinned first, then chronological. Compound index supports this:
        // { topicId: 1, isPinned: -1, createdAt: 1 }
        const comments = await GigComment.find({
            topicId: gigId,
            collectionType: 'gig'
        }).sort({ isPinned: -1, createdAt: 1 });

        const masked = comments.map(applyDeletedMask);

        res.json({ success: true, data: masked });
    } catch (error: any) {
        console.error('Error fetching gig discussion:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch discussion' });
    }
};

/**
 * POST /gigs/:gigId/discussion
 * Add a comment to a gig discussion. New comments default to unpinned and
 * not-deleted.
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

/**
 * PUT /gigs/:gigId/discussion/:commentId/pin
 * Toggle pin state on a comment. Organizer-only (Q1 → a). Cap of 3 (Q2 → b):
 * when pinning a 4th, the oldest currently-pinned auto-unpins so the cap
 * stays at 3. Soft-deleted comments cannot be pinned.
 */
export const togglePinGigComment = async (req: Request, res: Response) => {
    try {
        const { gigId, commentId } = req.params;
        const user = (req as any).user;

        if (!mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ success: false, message: 'Invalid comment id' });
        }

        const gig = await Gig.findById(gigId);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        // Authorization — only the gig owner (or admin) can pin/unpin.
        const organizerId = resolveOrganizerId(gig);
        const isOwner = !!organizerId && String(organizerId) === String(user.id);
        const isAdmin = user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Only the gig owner can pin comments' });
        }

        const comment = await GigComment.findOne({
            _id: commentId,
            topicId: gigId,
            collectionType: 'gig',
        });
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }
        if (comment.isDeleted) {
            return res.status(400).json({ success: false, message: 'Cannot pin a deleted comment' });
        }

        if (comment.isPinned) {
            // Unpin
            comment.isPinned = false;
            comment.pinnedAt = undefined;
            comment.pinnedBy = undefined;
            await comment.save();
        } else {
            // Pin — enforce cap. If at cap, unpin the oldest pinned first so we
            // never exceed PIN_CAP. Single transaction would be ideal but the
            // existing controller doesn't use transactions; relying on the
            // controller-level lock pattern here.
            const pinnedCount = await GigComment.countDocuments({
                topicId: gigId,
                collectionType: 'gig',
                isPinned: true,
            });
            if (pinnedCount >= PIN_CAP) {
                const oldest = await GigComment.findOne({
                    topicId: gigId,
                    collectionType: 'gig',
                    isPinned: true,
                }).sort({ pinnedAt: 1 });
                if (oldest) {
                    oldest.isPinned = false;
                    oldest.pinnedAt = undefined;
                    oldest.pinnedBy = undefined;
                    await oldest.save();
                    io.to(`discussion:gig:${gigId}`).emit('discussion:pin', { _id: oldest._id, isPinned: false });
                }
            }
            comment.isPinned = true;
            comment.pinnedAt = new Date();
            comment.pinnedBy = new mongoose.Types.ObjectId(user.id);
            await comment.save();
        }

        // Emit so other clients update without a refetch.
        io.to(`discussion:gig:${gigId}`).emit('discussion:pin', {
            _id: comment._id,
            isPinned: comment.isPinned,
            pinnedAt: comment.pinnedAt,
            pinnedBy: comment.pinnedBy,
        });

        res.json({ success: true, data: comment });
    } catch (error: any) {
        console.error('Error toggling pin:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle pin' });
    }
};

/**
 * DELETE /gigs/:gigId/discussion/:commentId
 * Soft-delete a comment (Q4 → b). Authority (Q3 → c): author OR gig
 * organizer OR platform admin. Marks the comment isDeleted, stamps
 * deletedAt/deletedBy/deletedReason. Pinned comments are auto-unpinned on
 * delete to keep the pinned tier clean.
 */
export const deleteGigComment = async (req: Request, res: Response) => {
    try {
        const { gigId, commentId } = req.params;
        const user = (req as any).user;

        if (!mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({ success: false, message: 'Invalid comment id' });
        }

        const gig = await Gig.findById(gigId);
        if (!gig) {
            return res.status(404).json({ success: false, message: 'Gig not found' });
        }

        const comment = await GigComment.findOne({
            _id: commentId,
            topicId: gigId,
            collectionType: 'gig',
        });
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }
        if (comment.isDeleted) {
            // Idempotent — already deleted.
            return res.json({ success: true, data: applyDeletedMask(comment) });
        }

        const isAuthor = String(comment.authorId) === String(user.id);
        const organizerId = resolveOrganizerId(gig);
        const isOrganizer = !!organizerId && String(organizerId) === String(user.id);
        const isAdmin = user.role === 'admin';

        if (!isAuthor && !isOrganizer && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this comment' });
        }

        comment.isDeleted = true;
        comment.deletedAt = new Date();
        comment.deletedBy = new mongoose.Types.ObjectId(user.id);
        comment.deletedReason = isAuthor ? 'self' : isOrganizer ? 'organizer' : 'admin';
        // Auto-unpin on delete so the pinned cap reflects only live comments.
        if (comment.isPinned) {
            comment.isPinned = false;
            comment.pinnedAt = undefined;
            comment.pinnedBy = undefined;
        }
        await comment.save();

        const masked = applyDeletedMask(comment);
        io.to(`discussion:gig:${gigId}`).emit('discussion:delete', masked);

        res.json({ success: true, data: masked });
    } catch (error: any) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ success: false, message: 'Failed to delete comment' });
    }
};
