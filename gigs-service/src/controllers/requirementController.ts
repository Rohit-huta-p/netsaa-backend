// src/controllers/requirementController.ts
import { Response, NextFunction } from 'express';
import Requirement, { PROPOSAL_CAP } from '../models/Requirement';
import { AuthRequest } from './gigController';
import { normalizeRole, isAgencySupplier } from '../utils/roleVisibility';
import { organizerCategory } from '../utils/agency';
import { deriveOccasionTag } from '../utils/occasionTag';
import { escapeRegex } from '../utils/escapeRegex';

const sendResponse = (res: Response, status: number, data: any = null, message = 'OK', errors: any[] = []) => {
    res.status(status).json({ meta: { status, message }, data, errors });
};

// Open-requirement cap removed (founder decision 2026-06-13): clients may post
// unlimited open requirements. The 5-min dedupe below still guards double-taps.

export const createRequirement = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const role = normalizeRole(req.user?.role);
        if (role !== 'client') {
            return sendResponse(res, 403, null, 'Only clients can post requirements');
        }

        const { title, occasionText, description, city, eventDate, budgetMin, budgetMax, photos } = req.body || {};
        if (!title || String(title).trim().length < 5) {
            return sendResponse(res, 400, null, 'title must be at least 5 characters');
        }
        if (String(title).trim().length > 100) {
            return sendResponse(res, 400, null, 'title must be 100 characters or fewer');
        }
        if (!occasionText || !String(occasionText).trim()) {
            return sendResponse(res, 400, null, 'occasionText is required');
        }
        // Fix 4: max length pre-check
        if (String(occasionText).trim().length > 80) {
            return sendResponse(res, 400, null, 'occasionText must be 80 characters or fewer');
        }
        if (!description || String(description).trim().length < 20) {
            return sendResponse(res, 400, null, 'description must be at least 20 characters');
        }
        // Fix 4: max length pre-check
        if (String(description).trim().length > 2000) {
            return sendResponse(res, 400, null, 'description must be 2000 characters or fewer');
        }
        if (!city || !String(city).trim()) {
            return sendResponse(res, 400, null, 'city is required');
        }
        const date = new Date(eventDate);
        if (!eventDate || isNaN(date.getTime())) {
            return sendResponse(res, 400, null, 'eventDate must be a valid date');
        }
        // Fix 2: past date guard
        if (date.getTime() < Date.now()) {
            return sendResponse(res, 400, null, 'eventDate must be in the future');
        }

        // Fix 4: numeric shape guards
        const min = budgetMin != null ? Number(budgetMin) : null;
        const max = budgetMax != null ? Number(budgetMax) : null;
        if ((min != null && !Number.isFinite(min)) || (max != null && !Number.isFinite(max))) {
            return sendResponse(res, 400, null, 'budgetMin/budgetMax must be numbers');
        }
        if (min != null && max != null && min > max) {
            return sendResponse(res, 400, null, 'budgetMin cannot exceed budgetMax');
        }

        // Fix 3: dedupe BEFORE open-limit (double-tap returns 200-existing instead of 409)
        const recentDup = await Requirement.findOne({
            clientId: req.user.id,
            occasionText: String(occasionText).trim(),
            city: String(city).trim(),
            eventDate: date,
            createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
        });
        if (recentDup) {
            return sendResponse(res, 200, recentDup, 'Requirement already posted');
        }

        // Snapshot the client's business type (organizerTypeCategory) alongside
        // name + city, so the requirement detail can show an "Agency / Company"
        // badge without a cross-service join. Point-in-time by design — requirements
        // created before this change simply won't carry hirerType (badge hides).
        const hirerType = await organizerCategory(req.user.id);

        const requirement = await Requirement.create({
            clientId: req.user.id,
            // Snapshot of the client at post time (displayName + city from JWT,
            // hirerType from the Organizer doc). Mongoose drops hirerType if undefined.
            clientSnapshot: {
                displayName: req.user.displayName || req.user.name || 'Client',
                city: req.user.primaryCity,
                hirerType,
            },
            title: String(title).trim(),
            occasionText: String(occasionText).trim(),
            occasionTag: deriveOccasionTag(String(occasionText)),
            description: String(description).trim(),
            city: String(city).trim(),
            eventDate: date,
            budgetMin: min,
            budgetMax: max,
            photos: Array.isArray(photos) ? photos.slice(0, 3) : [],
            status: 'open',
            proposalCount: 0,
            expiresAt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
        });

        sendResponse(res, 201, requirement, 'Requirement posted');
    } catch (err: any) {
        console.error(err);
        // Fix 4: ValidationError / CastError -> 400
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

export const getMyRequirements = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const role = normalizeRole(req.user?.role);
        if (role !== 'client') {
            return sendResponse(res, 403, null, 'Only clients can list their requirements');
        }
        const requirements = await Requirement.find({ clientId: req.user.id }).sort({ createdAt: -1 });
        sendResponse(res, 200, { requirements });
    } catch (err: any) {
        console.error(err);
        // Fix 4: ValidationError / CastError -> 400
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

export const getRequirementsFeed = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const role = normalizeRole(req.user?.role);
        let agency = false;
        if (role === 'client') {
            agency = isAgencySupplier(role, await organizerCategory(req.user.id));
        }
        if (role !== 'creative_lead' && role !== 'admin' && !agency) {
            return sendResponse(res, 403, null, 'Only Creative Leads and agencies can browse requirements');
        }
        const { q, city, occasion, minBudget, sort, occasionTag, dateFrom, dateTo, page = 1, pageSize = 20 } = req.query as any;

        // Fix 5: validate dates first
        if (dateFrom) {
            const d = new Date(String(dateFrom));
            if (isNaN(d.getTime())) return sendResponse(res, 400, null, 'invalid dateFrom/dateTo');
        }
        if (dateTo) {
            const d = new Date(String(dateTo));
            if (isNaN(d.getTime())) return sendResponse(res, 400, null, 'invalid dateFrom/dateTo');
        }

        // Fix 2: feed base query excludes expired docs
        const query: any = { status: 'open', proposalCount: { $lt: PROPOSAL_CAP }, expiresAt: { $gt: new Date() } };
        // Agency-supplier sees other clients' open requirements but never its OWN posts.
        if (agency) query.clientId = { $ne: req.user.id };

        // OR-groups (multi-city, free-text q) combine under one $and so they don't collide.
        const and: any[] = [];
        // City — multi (CSV): OR over each city regex. Fix 8: escape input before $regex.
        if (city) {
            const cities = String(city).split(',').map((s) => s.trim()).filter(Boolean);
            if (cities.length) and.push({ $or: cities.map((c) => ({ city: { $regex: escapeRegex(c), $options: 'i' } })) });
        }
        // Free-text q — OR over title / occasionText / description.
        if (q) {
            const rx = { $regex: escapeRegex(String(q)), $options: 'i' };
            and.push({ $or: [{ title: rx }, { occasionText: rx }, { description: rx }] });
        }
        // Occasion — multi (CSV → $in on the structured tag). Free-text occasions are reachable via q.
        const occ = occasion || occasionTag;
        if (occ) {
            // occasionTag is stored lowercased; normalize the filter values to match.
            const tags = String(occ).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
            if (tags.length) query.occasionTag = { $in: tags };
        }
        // Budget — minimum: requirements that can pay at least the threshold.
        if (minBudget) {
            const n = parseInt(String(minBudget), 10);
            if (Number.isFinite(n)) query.budgetMax = { $gte: n };
        }
        if (dateFrom || dateTo) {
            query.eventDate = {};
            if (dateFrom) query.eventDate.$gte = new Date(String(dateFrom));
            if (dateTo) query.eventDate.$lte = new Date(String(dateTo));
        }
        if (and.length) query.$and = and;

        // Sort
        let sortSpec: any = { createdAt: -1 }; // newest (default)
        if (sort === 'event') sortSpec = { eventDate: 1 };
        else if (sort === 'budget') sortSpec = { budgetMax: -1, createdAt: -1 };

        // Fix 5: clamp pagination
        const limit = Math.min(Math.max(parseInt(String(pageSize), 10) || 20, 1), 50);
        const pageNum = Math.max(parseInt(String(page), 10) || 1, 1);
        const skip = (pageNum - 1) * limit;
        const [requirements, total] = await Promise.all([
            Requirement.find(query).sort(sortSpec).skip(skip).limit(limit),
            Requirement.countDocuments(query),
        ]);
        sendResponse(res, 200, { requirements, page: pageNum, pageSize: limit, total });
    } catch (err: any) {
        console.error(err);
        // Fix 4: ValidationError / CastError -> 400
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

export const getRequirementById = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const requirement = await Requirement.findById(req.params.id);
        if (!requirement) {
            return sendResponse(res, 404, null, 'Requirement not found');
        }
        const role = normalizeRole(req.user?.role);
        const isOwner = String(requirement.clientId) === String(req.user?.id);
        let agency = false;
        if (role === 'client') {
            agency = isAgencySupplier(role, await organizerCategory(req.user.id));
        }
        if (!isOwner && role !== 'creative_lead' && role !== 'admin' && !agency) {
            return sendResponse(res, 403, null, 'Not allowed to view this requirement');
        }
        sendResponse(res, 200, requirement);
    } catch (err: any) {
        console.error(err);
        // Fix 4: ValidationError / CastError -> 400
        if (err?.name === 'ValidationError' || err?.name === 'CastError') {
            return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        }
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

const LOCKED_AFTER_PROPOSALS = ['occasionText', 'occasionTag', 'city', 'eventDate', 'budgetMin', 'budgetMax'];

export const editRequirement = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const requirement = await Requirement.findById(req.params.id);
        if (!requirement) return sendResponse(res, 404, null, 'Requirement not found');
        if (String(requirement.clientId) !== String(req.user?.id)) {
            return sendResponse(res, 403, null, 'Only the owner can edit this requirement');
        }

        const body = req.body || {};
        const hasProposals = (requirement.proposalCount || 0) > 0;

        // After the first proposal, core terms lock — only description + photos remain editable.
        if (hasProposals) {
            const attemptedLocked = LOCKED_AFTER_PROPOSALS.filter((k) => body[k] !== undefined);
            if (attemptedLocked.length > 0) {
                return sendResponse(res, 409, null,
                    'Budget, date and occasion are locked once proposals arrive. Close & repost to change them.',
                    [{ fields: attemptedLocked }]);
            }
        }

        const set: any = {};
        if (body.description !== undefined) {
            const d = String(body.description).trim();
            if (d.length < 20 || d.length > 2000) return sendResponse(res, 400, null, 'description must be 20–2000 chars');
            set.description = d;
        }
        if (Array.isArray(body.photos)) set.photos = body.photos.slice(0, 3);
        // title is always editable (before AND after proposals — it's a clarification headline, not a core term)
        if (body.title !== undefined) {
            const t = String(body.title).trim();
            if (t.length < 5) return sendResponse(res, 400, null, 'title must be at least 5 characters');
            if (t.length > 100) return sendResponse(res, 400, null, 'title must be 100 characters or fewer');
            set.title = t;
        }

        if (!hasProposals) {
            // Pre-proposal: core terms editable too (validate the same way create does).
            if (body.occasionText !== undefined) {
                const o = String(body.occasionText).trim();
                if (!o || o.length > 80) return sendResponse(res, 400, null, 'occasionText required (≤80)');
                set.occasionText = o;
                set.occasionTag = deriveOccasionTag(o);
            }
            if (body.city !== undefined) set.city = String(body.city).trim();
            if (body.eventDate !== undefined) {
                const dt = new Date(body.eventDate);
                if (isNaN(dt.getTime()) || dt.getTime() < Date.now()) return sendResponse(res, 400, null, 'eventDate must be a future date');
                set.eventDate = dt;
            }
            if (body.budgetMin !== undefined) {
                const parsedMin = body.budgetMin === null ? null : Number(body.budgetMin);
                if (parsedMin !== null && !Number.isFinite(parsedMin)) {
                    return sendResponse(res, 400, null, 'budgetMin/budgetMax must be numbers');
                }
                set.budgetMin = parsedMin;
            }
            if (body.budgetMax !== undefined) {
                const parsedMax = body.budgetMax === null ? null : Number(body.budgetMax);
                if (parsedMax !== null && !Number.isFinite(parsedMax)) {
                    return sendResponse(res, 400, null, 'budgetMin/budgetMax must be numbers');
                }
                set.budgetMax = parsedMax;
            }
            // When only ONE side is supplied, compare the incoming value against the PERSISTED
            // other side so a one-sided edit can't silently create an inverted range (min>max).
            const effectiveMin = set.budgetMin !== undefined ? set.budgetMin : requirement.budgetMin;
            const effectiveMax = set.budgetMax !== undefined ? set.budgetMax : requirement.budgetMax;
            if (effectiveMin != null && effectiveMax != null && effectiveMin > effectiveMax) {
                return sendResponse(res, 400, null, 'budgetMin cannot exceed budgetMax');
            }
        }

        if (Object.keys(set).length === 0) return sendResponse(res, 400, null, 'Nothing to update');

        const updated = await Requirement.findOneAndUpdate({ _id: req.params.id }, { $set: set }, { new: true, runValidators: true });
        // Notify-proposers hook: out of scope to DELIVER in Part A. If proposals exist, the
        // change is recorded by updatedAt; in-thread system messages handle the chosen-CL case.
        sendResponse(res, 200, updated, 'Requirement updated');
    } catch (err: any) {
        if (err?.name === 'ValidationError' || err?.name === 'CastError') return sendResponse(res, 400, null, 'Invalid input', [{ message: err.message }]);
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};

// Lifecycle: stop (open->closed), reopen (closed->open), cancel (->cancelled), book (->booked)
export const changeRequirementStatus = async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
        const { action } = req.body || {};
        if (!['stop', 'reopen', 'cancel', 'book'].includes(action)) {
            return sendResponse(res, 400, null, 'action must be stop, reopen, cancel or book');
        }
        const requirement = await Requirement.findById(req.params.id);
        if (!requirement) return sendResponse(res, 404, null, 'Requirement not found');
        if (String(requirement.clientId) !== String(req.user?.id)) {
            return sendResponse(res, 403, null, 'Only the owner can change this requirement');
        }

        let filter: any;
        let nextStatus: string;
        if (action === 'stop') { filter = { _id: req.params.id, status: 'open' }; nextStatus = 'closed'; }
        else if (action === 'reopen') { filter = { _id: req.params.id, status: 'closed' }; nextStatus = 'open'; }
        else if (action === 'cancel') { filter = { _id: req.params.id, status: { $in: ['open', 'in_discussion'] } }; nextStatus = 'cancelled'; }
        else { filter = { _id: req.params.id, status: { $in: ['open', 'in_discussion'] } }; nextStatus = 'booked'; }

        const updated = await Requirement.findOneAndUpdate(filter, { $set: { status: nextStatus } }, { new: true });
        if (!updated) return sendResponse(res, 409, null, `Cannot ${action} a requirement in status "${requirement.status}"`);
        // cancel notify-proposers: out of scope to deliver; future surface.
        sendResponse(res, 200, updated, `Requirement ${nextStatus}`);
    } catch (err: any) {
        console.error(err);
        sendResponse(res, 500, null, 'Server Error', [{ message: err.message }]);
    }
};
