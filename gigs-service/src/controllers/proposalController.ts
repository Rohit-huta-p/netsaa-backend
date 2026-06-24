// src/controllers/proposalController.ts
import { Response, NextFunction } from 'express';
import Requirement, { PROPOSAL_CAP } from '../models/Requirement';
import Proposal from '../models/Proposal';
import Invite from '../models/Invite';
import { AuthRequest } from './gigController';
import { normalizeRole, isAgencySupplier } from '../utils/roleVisibility';
import { organizerCategory } from '../utils/agency';

const sendResponse = (res: Response, status: number, data: any = null, message = 'OK', errors: any[] = []) => {
    res.status(status).json({ meta: { status, message }, data, errors });
};

export const createProposal = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const role = normalizeRole(req.user?.role);
        if (role !== 'creative_lead') {
            // Per-invite wall exception: an invited artist may propose on EXACTLY the
            // requirement they were invited to. Verified against the Invite record.
            if (role === 'artist') {
                const invite = await Invite.findOne({
                    toUserId: req.user.id,
                    requirementId: req.params.id,
                    status: { $in: ['sent', 'viewed', 'accepted'] },
                });
                if (!invite) {
                    return sendResponse(res, 403, null, 'Only Creative Leads can send proposals');
                }
                // invited artist allowed — fall through
            } else if (role === 'client' && isAgencySupplier(role, await organizerCategory(req.user.id))) {
                // Agency-supplier may propose — but never on its OWN requirement.
                const requirement = await Requirement.findById(req.params.id).select('clientId');
                if (requirement && String(requirement.clientId) === String(req.user.id)) {
                    return sendResponse(res, 403, null, 'You cannot propose on your own requirement');
                }
                // allowed — fall through
            } else {
                return sendResponse(res, 403, null, 'Only Creative Leads can send proposals');
            }
        }
        const { pitch, quoteAmount, portfolioLinks } = req.body || {};
        if (!pitch || String(pitch).trim().length < 20) {
            return sendResponse(res, 400, null, 'pitch must be at least 20 characters');
        }
        // Fix 4: pre-check max length
        if (String(pitch).trim().length > 1500) {
            return sendResponse(res, 400, null, 'pitch must be 1500 characters or fewer');
        }
        // Fix 4: reject non-finite quoteAmount
        if (quoteAmount != null && !Number.isFinite(Number(quoteAmount))) {
            return sendResponse(res, 400, null, 'quoteAmount must be a number');
        }

        // Atomic slot reservation: only succeeds while open and under cap.
        const requirement = await Requirement.findOneAndUpdate(
            { _id: req.params.id, status: 'open', proposalCount: { $lt: PROPOSAL_CAP } },
            { $inc: { proposalCount: 1 } },
            { new: true },
        );
        if (!requirement) {
            return sendResponse(res, 409, null, 'This requirement is no longer accepting proposals');
        }

        try {
            const proposal = await Proposal.create({
                requirementId: req.params.id,
                leadId: req.user.id,
                // Fix 7: trim snapshot to real JWT fields only (drop trustTier)
                leadSnapshot: {
                    displayName: req.user.displayName || req.user.name || 'Creative Lead',
                    profileImageUrl: req.user.profileImageUrl,
                },
                pitch: String(pitch).trim(),
                quoteAmount: quoteAmount != null ? Number(quoteAmount) : null,
                portfolioLinks: Array.isArray(portfolioLinks) ? portfolioLinks.slice(0, 5) : [],
                status: 'sent',
                timeline: [{ event: 'sent', at: new Date() }],
            });
            // TODO(notifications follow-up): enqueue netsa_proposal_received via MSG91 once templates approved
            return sendResponse(res, 201, proposal, 'Proposal sent');
        } catch (err: any) {
            // Duplicate (one proposal per CL) -> release the reserved slot
            await Requirement.findOneAndUpdate({ _id: req.params.id }, { $inc: { proposalCount: -1 } });
            if (err.code === 11000) {
                // Fix 6: honest product message — one proposal ever per CL per requirement
                return sendResponse(res, 409, null, 'You already sent a proposal for this requirement. Withdrawn proposals cannot be re-sent.');
            }
            // Fix 4: ValidationError / CastError -> 400
            if (err?.name === 'ValidationError' || err?.name === 'CastError') {
                return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
            }
            throw err;
        }
    } catch (err: any) {
        console.error(err);
        // Fix 4: ValidationError / CastError -> 400 at outer level too
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

export const getProposalsForRequirement = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const requirement = await Requirement.findById(req.params.id);
        if (!requirement) {
            return sendResponse(res, 404, null, 'Requirement not found');
        }
        if (String(requirement.clientId) !== String(req.user?.id)) {
            return sendResponse(res, 403, null, 'Only the requirement owner can view proposals');
        }
        // Fix 9: flip sent->viewed BEFORE the list read so owner's first fetch shows 'viewed'
        await Proposal.updateMany(
            { requirementId: req.params.id, status: 'sent' },
            { $set: { status: 'viewed' }, $push: { timeline: { event: 'viewed', at: new Date() } } },
        );
        const proposals = await Proposal.find({ requirementId: req.params.id }).sort({ createdAt: -1 });
        sendResponse(res, 200, { proposals });
    } catch (err: any) {
        console.error(err);
        // Fix 4: ValidationError / CastError -> 400
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// GET /proposals/mine — the proposals the viewer has SENT (as a lead). Self-scoped
// by leadId, so it needs no role gate (non-proposers just get an empty list). Each
// proposal is joined to its requirement's basics so the supplier's "Sent" inbox can
// show what they pitched on without an extra round-trip per card.
export const getMyProposals = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const proposals = await Proposal.find({ leadId: req.user.id })
            .sort({ createdAt: -1 })
            .lean();

        const reqIds = [...new Set(proposals.map((p: any) => String(p.requirementId)))];
        const requirements = reqIds.length
            ? await Requirement.find({ _id: { $in: reqIds } })
                  .select('title occasionText city eventDate status budgetMin budgetMax clientSnapshot')
                  .lean()
            : [];
        const reqMap = new Map(requirements.map((r: any) => [String(r._id), r]));

        const enriched = proposals.map((p: any) => ({
            ...p,
            requirement: reqMap.get(String(p.requirementId)) ?? null,
        }));
        sendResponse(res, 200, { proposals: enriched });
    } catch (err: any) {
        console.error(err);
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

export const patchProposal = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const { action } = req.body || {};
        if (!['accept', 'decline', 'withdraw'].includes(action)) {
            return sendResponse(res, 400, null, 'action must be accept, decline or withdraw');
        }
        // Keep findById for 404 + ownership checks; the atomic update is the act (Fix 1)
        const proposal = await Proposal.findById(req.params.id);
        if (!proposal) {
            return sendResponse(res, 404, null, 'Proposal not found');
        }
        const requirement = await Requirement.findById(proposal.requirementId);
        if (!requirement) {
            return sendResponse(res, 404, null, 'Requirement not found');
        }

        const viewerId = String(req.user?.id);
        const isOwner = String(requirement.clientId) === viewerId;
        const isLead = String(proposal.leadId) === viewerId;

        // Fix 1: atomic status flip for withdraw
        if (action === 'withdraw') {
            if (!isLead) return sendResponse(res, 403, null, 'Only the proposal author can withdraw');
            const flipped = await Proposal.findOneAndUpdate(
                { _id: req.params.id, leadId: req.user.id, status: { $in: ['sent', 'viewed'] } },
                { $set: { status: 'withdrawn' }, $push: { timeline: { event: 'withdrawn', at: new Date() } } },
                { new: true },
            );
            if (!flipped) {
                return sendResponse(res, 400, null, `Cannot withdraw a ${proposal.status} proposal`);
            }
            // Free the reserved slot for OTHER leads (the unique index still blocks re-proposing).
            const released = await Requirement.findOneAndUpdate(
                { _id: proposal.requirementId, proposalCount: { $gt: 0 } },
                { $inc: { proposalCount: -1 } },
            );
            if (!released) console.error(`[proposals] slot release skipped (count already 0) for requirement ${proposal.requirementId}`);
            return sendResponse(res, 200, flipped, 'Proposal withdrawn');
        }

        if (!isOwner) return sendResponse(res, 403, null, 'Only the requirement owner can accept or decline');

        // Fix 1: atomic status flip for accept/decline
        const nextStatus = action === 'accept' ? 'accepted' : 'declined';
        const flipped = await Proposal.findOneAndUpdate(
            { _id: req.params.id, status: { $in: ['sent', 'viewed'] } },
            { $set: { status: nextStatus }, $push: { timeline: { event: nextStatus, at: new Date() } } },
            { new: true },
        );
        if (!flipped) {
            return sendResponse(res, 400, null, `Cannot ${action} a ${proposal.status} proposal`);
        }
        if (action === 'accept') {
            await Requirement.findOneAndUpdate(
                { _id: proposal.requirementId, status: 'open' },
                { $set: { status: 'in_discussion' } },
            );
        }
        return sendResponse(res, 200, flipped, `Proposal ${nextStatus}`);
    } catch (err: any) {
        console.error(err);
        // Fix 4: ValidationError / CastError -> 400
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};
