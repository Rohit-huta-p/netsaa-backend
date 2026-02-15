import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Gig from '../models/Gig';
import GigStats from '../models/GigStats';
import GigApplication from '../models/GigApplication';
import SavedGig from '../models/SavedGig';
import { notificationEvents } from '../notifications/event.emitter';

// Helper for standard response
const sendResponse = (res: Response, status: number, data: any = null, message: string = 'OK', errors: any[] = []) => {
    res.status(status).json({
        meta: { status, message },
        data,
        errors
    });
};

export interface AuthRequest extends Request {
    user?: any; // To be typed properly with Auth middleware definition
}

// @desc    Get all gigs
// @route   GET /v1/gigs
// @access  Public
export const getGigs = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { artistType, city, status, featured, page = 1, pageSize = 20, q } = req.query;

        const query: any = {};

        // Search query - search across multiple fields
        if (q && typeof q === 'string') {
            const searchRegex = { $regex: q.trim(), $options: 'i' };
            query.$or = [
                { title: searchRegex },
                { description: searchRegex },
                { tags: searchRegex },
                { requiredSkills: searchRegex },
                { 'organizerSnapshot.displayName': searchRegex },
                { 'organizerSnapshot.organizationName': searchRegex },
                { artistTypes: searchRegex },
                { category: searchRegex }
            ];
        }

        if (artistType) {
            query.artistTypes = artistType;
        }
        if (city) {
            query['location.city'] = { $regex: city, $options: 'i' };
        }
        if (status) {
            query.status = status;
        } else {
            // Default to published if not specified
            query.status = 'published';
        }
        if (featured === 'true') {
            query.isFeatured = true;
        }

        const limit = Number(pageSize);
        const skip = (Number(page) - 1) * limit;

        const gigs = await Gig.find(query)
            .sort({ publishedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Gig.countDocuments(query);

        sendResponse(res, 200, {
            gigs,
            pagination: {
                page: Number(page),
                pageSize: limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Get all gigs for an organizer (Dashboard)
// @route   GET /v1/organizers/me/gigs
// @access  Private (Organizer)
export const getOrganizerGigs = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { organizerId } = req.query; // Or req.user.id if using auth middleware

        if (!organizerId) {
            return sendResponse(res, 400, null, 'Organizer ID required');
        }

        const gigs = await Gig.find({ organizerId }).sort({ createdAt: -1 });

        // Get stats for each gig
        const gigsWithStats = await Promise.all(gigs.map(async (gig) => {
            const stats = await GigStats.findOne({ gigId: gig._id });
            return {
                ...gig.toObject(),
                stats: stats ? stats.toObject() : null
            };
        }));

        sendResponse(res, 200, {
            gigs: gigsWithStats,
            total: gigs.length
        });
    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Get single gig
// @route   GET /v1/gigs/:id
// @access  Public
export const getGigById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        let gig = await Gig.findById(req.params.id);
        if (!gig) {
            return sendResponse(res, 404, null, 'Gig not found');
        }

        // Populate organizer details from User collection if possible
        // We cast to any because we want to check if population worked
        await gig.populate('organizerId', 'displayName profileImageUrl cached kycStatus');

        const organizer = gig.organizerId as any;

        let organizerSnapshot = gig.organizerSnapshot;

        // If we successfully populated the user, use fresh data
        if (organizer && organizer._id) {
            organizerSnapshot = {
                displayName: organizer.displayName || organizerSnapshot.displayName,
                organizationName: organizerSnapshot.organizationName, // Keep original or fetch if stored in User
                profileImageUrl: organizer.profileImageUrl || organizerSnapshot.profileImageUrl,
                rating: organizer.cached?.averageRating || organizerSnapshot.rating,
                // Add verification status
                // @ts-ignore - Adding dynamic property not in original schema interface for response
                isVerified: organizer.kycStatus === 'approved'
            };
        } else {
            // Fallback if population fails or user deleted
            // @ts-ignore
            organizerSnapshot.isVerified = false;
        }

        // Increment views (fire and forget / async)
        GigStats.findOneAndUpdate(
            { gigId: gig._id },
            { $inc: { views: 1 }, $set: { lastViewedAt: new Date() } }
        ).exec();

        // Fetch Stats
        const stats = await GigStats.findOne({ gigId: gig._id });

        let viewerContext = null;
        // Check for viewer context (if artist)
        // Check req.user which is populated by optionalAuth
        const user = (req as AuthRequest).user;
        console.log('[getGigById] optionalAuth user:', user ? { id: user.id, role: user.role } : 'NO USER (token missing or invalid)');
        console.log('[getGigById] Authorization header present:', !!req.headers.authorization);
        if (user) {
            const hasApplied = await GigApplication.exists({ gigId: gig._id, artistId: user.id });
            console.log('[getGigById] hasApplied query result:', hasApplied, 'for artistId:', user.id, 'gigId:', gig._id);
            viewerContext = { hasApplied: !!hasApplied };
        }

        // Construct response object
        const responseData = {
            ...gig.toObject(),
            organizerSnapshot, // Override with fresh/enhanced snapshot
            stats: stats ? stats.toObject() : null,
            viewerContext
        };

        sendResponse(res, 200, responseData);
    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Create new gig
// @route   POST /v1/gigs
// @access  Private (Organizer)
export const createGig = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        // Basic validation could be done here or middleware (Zod)
        // For now assuming body matches schema roughly
        const { title, description, type, category, location, schedule, compensation, applicationDeadline } = req.body;

        // TODO: Use Organizer snapshot from Auth User Profile
        const organizerId = req.user.id;
        const organizerSnapshot = {
            displayName: req.user.displayName || req.user.name || 'Organizer',
            organizationName: req.user.organizationName || 'TBD',
            profileImageUrl: req.user.profileImageUrl || '',
            rating: 0 // Default or fetch
        };

        const newGig = await Gig.create({
            ...req.body,
            organizerId,
            organizerSnapshot,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Create Initial Stats
        await GigStats.create({
            gigId: newGig._id
        });

        sendResponse(res, 201, newGig, 'Gig created successfully');
    } catch (err: any) {
        console.error(err);
        sendResponse(res, 400, null, 'Validation Error', [{ message: err.message }]);
    }
};

// @desc    Apply to a gig
// @route   POST /v1/gigs/:id/apply
// @access  Private (Artist)
export const applyToGig = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { coverNote, portfolioLinks } = req.body;
        const gigId = req.params.id;
        const artistId = req.user.id;

        const gig = await Gig.findById(gigId).session(session);
        if (!gig) {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 404, null, 'Gig not found');
        }

        if (gig.status !== 'published') {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 400, null, 'Gig is not accepting applications');
        }

        // Check Deadline
        if (gig.applicationDeadline && new Date() > new Date(gig.applicationDeadline)) {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 400, null, 'Application deadline has passed');
        }

        // Check Max Applications
        if (gig.maxApplications) {
            // We use GigStats for quick check, or count documents. 
            // Counting documents is safer within transaction to avoid race conditions on the counter specific logic, 
            // but relying on GigStats is faster if we trust it. 
            // Let's count actual applications to be safe strictly.
            const currentCount = await GigApplication.countDocuments({ gigId }).session(session);
            if (currentCount >= gig.maxApplications) {
                await session.abortTransaction();
                session.endSession();
                return sendResponse(res, 400, null, 'Maximum applications reached');
            }
        }

        // Check existing application
        const existingApp = await GigApplication.findOne({ gigId, artistId }).session(session);
        if (existingApp) {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 400, null, 'Already applied');
        }
        console.log("[GIG APPLY] USER: ", req.user)
        // Create Application
        const artistSnapshot = {
            displayName: req.user.displayName || req.user.name || 'Artist',
            artistType: req.user.artistType || 'General',
            profileImageUrl: req.user.profileImageUrl || '',
            rating: req.user.rating || 0
        };

        const application = await GigApplication.create([{
            gigId,
            artistId,
            artistSnapshot,
            coverNote,
            portfolioLinks,
            status: 'applied'
        }], { session });

        // Update Stats
        await GigStats.findOneAndUpdate(
            { gigId },
            { $inc: { applications: 1 } },
            { session }
        );

        await session.commitTransaction();
        session.endSession();

        // Emit event for notification system (fire-and-forget)
        notificationEvents.emitGigApplicationReceived({
            gigId: gigId,
            applicationId: application[0]._id.toString(),
            gigOwnerId: gig.organizerId.toString(),
            applicantId: artistId,
            gigTitle: gig.title,
        });

        sendResponse(res, 200, application[0], 'Application submitted');

    } catch (err: any) {
        await session.abortTransaction();
        session.endSession();

        if (err.code === 11000) {
            return sendResponse(res, 400, null, 'Already applied');
        }
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Get applications for a gig
// @route   GET /v1/organizers/me/gigs/:gigId/applications
// @access  Private (Organizer)
export const getGigApplications = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { gigId } = req.params;
        const organizerId = req.user.id;

        const gig = await Gig.findById(gigId);
        if (!gig) {
            return sendResponse(res, 404, null, 'Gig not found');
        }

        if (gig.organizerId.toString() !== organizerId) {
            return sendResponse(res, 403, null, 'Not authorized to view applications for this gig');
        }

        const applications = await GigApplication.find({ gigId }).sort({ appliedAt: -1 });
        console.log(applications);
        sendResponse(res, 200, applications);
    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Update application status
// @route   PATCH /v1/applications/:applicationId/status
// @access  Private (Organizer)
export const updateApplicationStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { applicationId } = req.params;
        const { status } = req.body;
        const organizerId = req.user.id;

        const application = await GigApplication.findById(applicationId).session(session);
        if (!application) {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 404, null, 'Application not found');
        }

        const gig = await Gig.findById(application.gigId).session(session);
        if (!gig) {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 404, null, 'Associated Gig not found');
        }

        if (gig.organizerId.toString() !== organizerId) {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 403, null, 'Not authorized to manage this application');
        }

        // State Machine validation
        const validTransitions: any = {
            'applied': ['shortlisted', 'rejected'],
            'shortlisted': ['hired', 'rejected'],
            'rejected': [], // Terminal state? Maybe allow reconsidering? The spec implies strict flow.
            'hired': []
        };

        const currentStatus = application.status;
        const allowed = validTransitions[currentStatus];

        if (!allowed || !allowed.includes(status)) {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 400, null, `Invalid status transition from ${currentStatus} to ${status}`);
        }

        // Perform Update
        application.status = status;
        await application.save({ session });

        // Update Stats Logic
        // If transitioning to shortlisted: inc shortlisted
        // If transitioning to hired: inc hired, dec shortlisted (if coming from shortlisted) -- Wait, flow is applied -> shortlisted -> hired.
        // Spec says: applied -> shortlisted, applied -> rejected, shortlisted -> hired, shortlisted -> rejected.

        const statsUpdate: any = {};

        if (status === 'shortlisted') {
            statsUpdate.$inc = { shortlisted: 1 };
        } else if (status === 'hired') {
            statsUpdate.$inc = { hired: 1 };
            // If it was shortlisted before, should we decrement shortlisted? 
            // Usually 'shortlisted' count means "Currently Shortlisted". 
            // So if it moves to hired, it is no longer just shortlisted.
            if (currentStatus === 'shortlisted') {
                statsUpdate.$inc.shortlisted = -1;
            }
        } else if (status === 'rejected') {
            // If rejected from shortlisted, decrement shortlisted
            if (currentStatus === 'shortlisted') {
                statsUpdate.$inc = { shortlisted: -1 };
            }
        }

        if (Object.keys(statsUpdate).length > 0) {
            await GigStats.findOneAndUpdate(
                { gigId: gig._id },
                statsUpdate,
                { session }
            );
        }

        await session.commitTransaction();
        session.endSession();

        // Emit event for notification system (fire-and-forget)
        notificationEvents.emitGigApplicationStatusChanged({
            gigId: gig._id.toString(),
            applicationId: applicationId,
            applicantId: application.artistId.toString(),
            gigOwnerId: organizerId,
            gigTitle: gig.title,
            oldStatus: currentStatus as any,
            newStatus: status as any,
        });

        sendResponse(res, 200, application, 'Application status updated');

    } catch (err: any) {
        await session.abortTransaction();
        session.endSession();
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Get user's applications
// @route   GET /v1/users/me/gig-applications
// @access  Private (Artist)
export const getUserApplications = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const artistId = req.user.id;

        const applications = await GigApplication.find({ artistId })
            .sort({ appliedAt: -1 })
            .populate('gigId', 'title organizerSnapshot compensation location schedule status applicationDeadline');
        // Populating specific fields of Gig

        sendResponse(res, 200, applications);
    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Save/Bookmark a gig
// @route   POST /v1/gigs/:id/save
// @access  Private
export const saveGig = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const gigId = req.params.id;
        const userId = req.user.id;

        // Toggle logic or just Save? API says "Save". Usually toggle is better UX but let's stick to "Save"
        const existing = await SavedGig.findOne({ gigId, userId });

        if (existing) {
            // Unsaving if it exists (Toggle)
            await SavedGig.deleteOne({ _id: existing._id });
            // Update Stats
            await GigStats.findOneAndUpdate(
                { gigId },
                { $inc: { saves: -1 } }
            );
            return sendResponse(res, 200, { saved: false }, 'Gig removed from saved');
        }

        await SavedGig.create({
            userId,
            gigId
        });

        // Update Stats
        await GigStats.findOneAndUpdate(
            { gigId },
            { $inc: { saves: 1 } }
        );

        sendResponse(res, 200, { saved: true }, 'Gig saved');

    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};
// @desc    Update gig
// @route   PATCH /v1/gigs/:id
// @access  Private (Organizer)
export const updateGig = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const gigId = req.params.id;
        const organizerId = req.user.id; // From auth middleware

        let gig = await Gig.findById(gigId);

        if (!gig) {
            return sendResponse(res, 404, null, 'Gig not found');
        }

        // Verify ownership
        if (gig.organizerId.toString() !== organizerId) {
            return sendResponse(res, 403, null, 'Not authorized to update this gig');
        }

        // Prevent updating immutable fields if necessary, or just rely on payload
        // Ideally we should sanitize req.body, but for now we trust the schema validation (if any) or just spread
        // The service usually handles partial updates via PATCH

        const updatedGig = await Gig.findByIdAndUpdate(gigId, req.body, {
            new: true,
            runValidators: true
        });

        sendResponse(res, 200, updatedGig, 'Gig updated successfully');
    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Delete gig
// @route   DELETE /v1/gigs/:id
// @access  Private (Organizer)
export const deleteGig = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const gigId = req.params.id;
        const organizerId = req.user.id;

        const gig = await Gig.findById(gigId).session(session);

        if (!gig) {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 404, null, 'Gig not found');
        }

        // Verify ownership
        if (gig.organizerId.toString() !== organizerId) {
            await session.abortTransaction();
            session.endSession();
            return sendResponse(res, 403, null, 'Not authorized to delete this gig');
        }

        // Cascade Delete
        // 1. Get all applicant IDs before deleting applications (for notification)
        const applications = await GigApplication.find({ gigId }).session(session);
        const applicantIds = applications.map(app => app.artistId.toString());

        // 2. Delete Applications
        await GigApplication.deleteMany({ gigId }).session(session);

        // 3. Delete Stats
        await GigStats.deleteOne({ gigId }).session(session);

        // 4. Delete Saved Gigs
        await SavedGig.deleteMany({ gigId }).session(session);

        // 5. Delete Gig
        await Gig.deleteOne({ _id: gigId }).session(session);

        await session.commitTransaction();
        session.endSession();

        // Emit event for notification system (fire-and-forget)
        // Only notify if there were applicants
        if (applicantIds.length > 0) {
            notificationEvents.emitGigCancelled({
                gigId: gigId,
                gigOwnerId: organizerId,
                gigTitle: gig.title,
                applicantIds: applicantIds,
                cancellationReason: 'Gig deleted by organizer',
            });
        }

        sendResponse(res, 200, {}, 'Gig and related data deleted successfully');
    } catch (err: any) {
        await session.abortTransaction();
        session.endSession();
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Get user's saved gigs
// @route   GET /v1/users/me/saved-gigs
// @access  Private
export const getSavedGigs = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user.id;

        const savedGigs = await SavedGig.find({ userId })
            .populate('gigId', 'title type category location schedule compensation applicationDeadline status organizerSnapshot')
            .sort({ savedAt: -1 })
            .lean();

        // Format response to include gig details
        const formattedSavedGigs = savedGigs.map((saved: any) => ({
            ...saved,
            gigDetails: saved.gigId,
            gigId: saved.gigId?._id
        }));

        sendResponse(res, 200, formattedSavedGigs, 'OK');

    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// @desc    Get organizer stats (for trust card)
// @route   GET /v1/users/:userId/organizer-stats
// @access  Public
export const getOrganizerStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = req.params;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendResponse(res, 400, null, 'Valid user ID required');
        }

        // Count gigs hosted by this organizer (published, closed, or expired)
        const gigsHosted = await Gig.countDocuments({
            organizerId: userId,
            status: { $in: ['published', 'closed', 'expired'] }
        });

        // Count total artists hired across all gigs
        const hiredCount = await GigApplication.countDocuments({
            status: 'hired'
        }).then(async () => {
            // Get gigs by this organizer
            const organizerGigs = await Gig.find({ organizerId: userId }).select('_id');
            const gigIds = organizerGigs.map(g => g._id);
            return GigApplication.countDocuments({ gigId: { $in: gigIds }, status: 'hired' });
        });

        sendResponse(res, 200, {
            gigsHosted,
            totalArtistsHired: hiredCount,
        });
    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};
