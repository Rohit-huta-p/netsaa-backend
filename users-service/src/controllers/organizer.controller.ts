import { Response } from 'express';
import Organizer from '../models/Organizer';
import { AuthRequest } from '../middleware/auth';
import { updateOrganizerSchema, containsForbiddenKeys } from '../validators/organizer.dto';

/**
 * PATCH /api/organizers/me
 * Partial update of the authenticated organizer's profile.
 */
export const patchMe = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        // Two-context model: all authenticated users have hirer context — no role guard needed.

        // Reject forbidden keys early
        const forbidden = containsForbiddenKeys(req.body);
        if (forbidden.length > 0) {
            return res.status(400).json({
                msg: 'Forbidden fields in request',
                fields: forbidden,
            });
        }

        // Validate with Zod
        const parsed = updateOrganizerSchema.safeParse(req.body);
        if (!parsed.success) {
            const errors = parsed.error.flatten();
            return res.status(400).json({ msg: 'Validation failed', errors });
        }

        // ── Fetch existing organizer for transition checks ──
        let existing = await Organizer.findOne({ userId: req.user._id });

        // Auto-create Organizer doc if it doesn't exist (backward compat for older accounts)
        if (!existing) {
            existing = await Organizer.create({
                userId: req.user._id,
                organizerTypeCategory: 'individual',
            });
            console.log('[ORGANIZER] Auto-created Organizer doc for user:', req.user._id);
        }

        const newCategory = parsed.data.organizerTypeCategory;
        const oldCategory = existing.organizerTypeCategory;
        const isCategoryChange = newCategory && newCategory !== oldCategory;

        // ── Rule 1: Block verified business → individual downgrade ──
        if (isCategoryChange && newCategory === 'individual') {
            if (existing.verification?.businessVerified === true) {
                return res.status(403).json({
                    msg: 'Cannot downgrade to individual while business is verified. Please contact admin for review.',
                    code: 'VERIFIED_DOWNGRADE_BLOCKED',
                });
            }
        }

        // ── Build $set payload (only defined keys) ──
        const setFields: Record<string, any> = {};
        for (const [key, value] of Object.entries(parsed.data)) {
            if (value !== undefined) {
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    // Nested object (billingDetails) — dot-notation merge
                    for (const [subKey, subVal] of Object.entries(value)) {
                        if (subVal !== undefined) {
                            setFields[`${key}.${subKey}`] = subVal;
                        }
                    }
                } else {
                    setFields[key] = value;
                }
            }
        }

        // ── Rule 2: Reset verification when individual → business type ──
        if (isCategoryChange && oldCategory === 'individual' && newCategory !== 'individual') {
            setFields['verification.businessVerified'] = false;
            setFields['verification.verificationLevel'] = 'none';
            setFields['verification.documentsSubmitted'] = false;
            setFields['verification.verifiedAt'] = undefined;
        }

        if (Object.keys(setFields).length === 0) {
            return res.status(400).json({ msg: 'No fields to update' });
        }

        const updated = await Organizer.findOneAndUpdate(
            { userId: req.user._id },
            { $set: setFields },
            { new: true, runValidators: true }
        );

        // ── Rule 3: Audit log for category changes ──
        if (isCategoryChange) {
            const auditEntry = {
                timestamp: new Date().toISOString(),
                userId: req.user._id,
                action: 'ORGANIZER_CATEGORY_CHANGE',
                from: oldCategory,
                to: newCategory,
                isCustomCategory: parsed.data.isCustomCategory ?? existing.isCustomCategory,
                customCategoryLabel: parsed.data.customCategoryLabel ?? existing.customCategoryLabel,
                verificationReset: oldCategory === 'individual' && newCategory !== 'individual',
            };
            console.log('[AUDIT] Organizer category change:', JSON.stringify(auditEntry));
        }

        res.json(updated);
    } catch (err: any) {
        console.error('ORGANIZER CONTROLLER patchMe ERROR:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};

/**
 * GET /api/organizers/me
 * Fetch the authenticated organizer's profile.
 */
export const getMe = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        let organizer = await Organizer.findOne({ userId: req.user._id });

        // Auto-create Organizer doc if it doesn't exist (backward compat for older accounts)
        if (!organizer) {
            organizer = await Organizer.create({
                userId: req.user._id,
                organizerTypeCategory: 'individual',
            });
            console.log('[ORGANIZER] Auto-created Organizer doc for user:', req.user._id);
        }

        res.json(organizer);
    } catch (err: any) {
        console.error('ORGANIZER CONTROLLER getMe ERROR:', err.message);
        res.status(500).json({ msg: 'Server error' });
    }
};
