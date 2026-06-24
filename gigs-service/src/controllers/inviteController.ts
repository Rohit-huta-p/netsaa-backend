// src/controllers/inviteController.ts
import { Response, NextFunction } from 'express';
import Invite from '../models/Invite';
import Requirement from '../models/Requirement';
import User from '../models/User';
import { AuthRequest } from './gigController';
import { normalizeRole } from '../utils/roleVisibility';
import { organizerCategory } from '../utils/agency';

const sendResponse = (res: Response, status: number, data: any = null, message = 'OK', errors: any[] = []) => {
    res.status(status).json({ meta: { status, message }, data, errors });
};

export const createInvite = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const role = normalizeRole(req.user?.role);
        if (role !== 'client') {
            return sendResponse(res, 403, null, 'Only clients can send invites');
        }
        const { toUserId, toRole, requirementId, note } = req.body || {};
        if (!toUserId || (toRole !== 'artist' && toRole !== 'creative_lead' && toRole !== 'agency')) {
            return sendResponse(res, 400, null, 'toUserId and a valid toRole (artist|creative_lead|agency) are required');
        }
        // Anti-abuse: an agency invite must target a genuine agency (org category === 'agency').
        if (toRole === 'agency') {
            const category = await organizerCategory(String(toUserId));
            if (category !== 'agency') {
                return sendResponse(res, 400, null, 'Recipient is not an agency');
            }
        }

        let requirementTitle: string | undefined;
        let reqRef: any = null;
        if (requirementId) {
            const requirement = await Requirement.findById(requirementId);
            if (!requirement) return sendResponse(res, 404, null, 'Requirement not found');
            if (String(requirement.clientId) !== String(req.user.id)) {
                return sendResponse(res, 403, null, 'You can only attach your own requirement');
            }
            if (requirement.status !== 'open') {
                return sendResponse(res, 409, null, 'That requirement is not open');
            }
            requirementTitle = (requirement as any).title || (requirement as any).occasionText;
            reqRef = requirementId;
        }
        if (!requirementId && (!note || String(note).trim().length < 3)) {
            return sendResponse(res, 400, null, 'A context-free invite needs a short note');
        }

        // Denormalize the recipient (mirrors fromSnapshot) so the client's "sent"
        // list shows the performer without a per-fetch join. Best-effort: if the
        // recipient can't be found we still create the invite, just without a snapshot.
        const toUser: any = await User.findById(toUserId)
            .select('displayName profileImageUrl cached.primaryCity')
            .lean();
        const toSnapshot = toUser
            ? { displayName: toUser.displayName, avatarUrl: toUser.profileImageUrl, city: toUser.cached?.primaryCity }
            : undefined;

        try {
            const invite = await Invite.create({
                fromClientId: req.user.id,
                fromSnapshot: { displayName: req.user.displayName || 'Client', city: req.user.primaryCity },
                toUserId,
                toSnapshot,
                toRole,
                requirementId: reqRef,
                requirementTitle,
                note: note ? String(note).trim().slice(0, 500) : undefined,
                status: 'sent',
            });
            // TODO(notifications): enqueue invite-received via MSG91 once templates approved
            return sendResponse(res, 201, invite, 'Invite sent');
        } catch (err: any) {
            if (err?.code === 11000) {
                const dupMsg = reqRef
                    ? "You've already invited them to this requirement."
                    : "You've already invited this person.";
                return sendResponse(res, 409, null, dupMsg);
            }
            if (err?.name === 'ValidationError' || err?.name === 'CastError') {
                return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
            }
            throw err;
        }
    } catch (err: any) {
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

export const getReceivedInvites = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const invites = await Invite.find({ toUserId: req.user.id }).sort({ createdAt: -1 });
        sendResponse(res, 200, { invites });
    } catch (err: any) {
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

export const getSentInvites = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const invites = await Invite.find({ fromClientId: req.user.id }).sort({ createdAt: -1 });
        sendResponse(res, 200, { invites });
    } catch (err: any) {
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

export const respondToInvite = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const { action } = req.body || {};
        if (!['accept', 'decline'].includes(action)) {
            return sendResponse(res, 400, null, 'action must be accept or decline');
        }
        const invite = await Invite.findById(req.params.id);
        if (!invite) return sendResponse(res, 404, null, 'Invite not found');
        if (String(invite.toUserId) !== String(req.user.id)) {
            return sendResponse(res, 403, null, 'Only the recipient can respond');
        }
        if (!['sent', 'viewed'].includes(invite.status)) {
            return sendResponse(res, 400, null, `Cannot ${action} a ${invite.status} invite`);
        }
        invite.status = action === 'accept' ? 'accepted' : 'declined';
        await invite.save();
        sendResponse(res, 200, invite, `Invite ${invite.status}`);
    } catch (err: any) {
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// Sender-side withdraw — frees the (client, recipient, requirement) slot so the
// client can re-invite. Only a still-pending invite ('sent'|'viewed') can be pulled;
// once accepted/declined it's terminal.
export const withdrawInvite = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const invite = await Invite.findById(req.params.id);
        if (!invite) return sendResponse(res, 404, null, 'Invite not found');
        if (String(invite.fromClientId) !== String(req.user.id)) {
            return sendResponse(res, 403, null, 'Only the sender can withdraw this invite');
        }
        if (!['sent', 'viewed'].includes(invite.status)) {
            return sendResponse(res, 400, null, `Cannot withdraw a ${invite.status} invite`);
        }
        invite.status = 'withdrawn';
        await invite.save();
        sendResponse(res, 200, invite, 'Invite withdrawn');
    } catch (err: any) {
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};
