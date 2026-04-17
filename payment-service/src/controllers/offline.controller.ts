import { Response } from 'express';
import crypto from 'crypto';
import Transaction from '../models/Transaction';
import { AuthRequest } from '../middleware/auth';
import { recordOfflineSchema } from '../validators/transaction.dto';
import { validateTransition } from '../utils/stateMachine';

const sendResponse = (res: Response, status: number, data: any = null, message: string = 'OK', errors: any[] = []) => {
    res.status(status).json({ meta: { status, message }, data, errors });
};

/**
 * Derive a deterministic idempotency key when client doesn't provide one.
 * Hash of the semantically-meaningful fields — two taps with the same payload
 * produce the same key.
 */
function deriveIdempotencyKey(input: {
    fromUserId: string;
    toUserId: string;
    amount: number;
    method: string;
    contractId?: string;
    gigId?: string;
    eventId?: string;
    referenceId?: string;
}): string {
    const canonical = [
        input.fromUserId,
        input.toUserId,
        input.amount.toFixed(2),
        input.method,
        input.contractId ?? '',
        input.gigId ?? '',
        input.eventId ?? '',
        input.referenceId ?? '',
    ].join('|');
    const hash = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 24);
    return `netsa_offline_${hash}`;
}

// @desc    Record an offline payment (UPI/cash/bank). Idempotent via Idempotency-Key header.
// @route   POST /v1/transactions/offline
// @access  Protected
export const recordOfflinePayment = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = recordOfflineSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendResponse(res, 400, null, 'Validation failed', parsed.error.issues);
        }

        const { toUserId, amount, method, referenceId, note, gigId, eventId, contractId } = parsed.data;
        const fromUserId = req.user.id;

        if (fromUserId === toUserId) {
            return sendResponse(res, 400, null, 'Cannot record a payment to yourself');
        }

        // Idempotency: client-provided header preferred; fallback to deterministic hash.
        // Previous bug (#MVP-001): used Date.now() which differed per call — concurrent
        // taps produced duplicate rows.
        const clientIdemKey = req.header('Idempotency-Key');
        const idempotencyKey = clientIdemKey
            ? `netsa_offline_${clientIdemKey.slice(0, 96)}`
            : deriveIdempotencyKey({ fromUserId, toUserId, amount, method, contractId, gigId, eventId, referenceId });

        // If a row already exists for this key, return it (200) instead of creating a duplicate.
        const existing = await Transaction.findOne({ idempotencyKey });
        if (existing) {
            return sendResponse(
                res,
                200,
                existing,
                'Offline payment already recorded for this request (idempotent replay).'
            );
        }

        // Rate limiting: max 3 offline recordings per week per user.
        // Counted AFTER idempotency check so legitimate retries don't burn quota.
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const recentCount = await Transaction.countDocuments({
            recordedBy: fromUserId,
            type: 'offline_record',
            createdAt: { $gte: weekAgo },
        });
        if (recentCount >= 3) {
            return sendResponse(res, 429, null, 'Maximum 3 offline recordings per week. Try again later.');
        }

        // Reject back-dated payments older than 90 days and any future date.
        // Prevents SLA-gaming by backdating to dodge on_time_payment penalty.
        // (The `paidAt` field is the user-reported payment date; `createdAt` on the
        // document is server-set and always authoritative for SLA calculations.)
        // paidAt is optional in the current DTO; when present, validate it.
        const paidAtRaw = (req.body as any).paidAt;
        const paidAt = paidAtRaw ? new Date(paidAtRaw) : new Date();
        const now = new Date();
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        if (paidAt > now) {
            return sendResponse(res, 422, null, 'Payment date cannot be in the future');
        }
        if (paidAt < ninetyDaysAgo) {
            return sendResponse(res, 422, null, 'Payment date cannot be older than 90 days');
        }

        try {
            const transaction = await Transaction.create({
                gigId,
                eventId,
                contractId,
                type: 'offline_record',
                paymentStructure: 'full',
                layer: 'primary',
                fromUserId,
                toUserId,
                amount,
                currency: 'INR',
                platformFee: { rate: 0, amount: 0 },
                artistReceived: amount,
                idempotencyKey,
                status: 'recorded', // Matches OFFLINE_TRANSITIONS in state machine (was 'created' — pre-fix bug)
                offlineDetails: { method, referenceId, note, paidAt, userReportedPaidAt: paidAt },
                recordedBy: fromUserId,
                timeline: [
                    {
                        event: 'offline_recorded',
                        at: new Date(),
                        metadata: { method, referenceId, paidAt: paidAt.toISOString() },
                    },
                ],
            });

            return sendResponse(
                res,
                201,
                transaction,
                'Offline payment recorded. Awaiting confirmation from the other party.'
            );
        } catch (err: any) {
            // Race: if a concurrent request wrote the same idempotencyKey between our
            // findOne check and create (compound unique index on idempotencyKey catches this),
            // return the winning row instead of erroring.
            if (err.code === 11000 && err.keyPattern?.idempotencyKey) {
                const winner = await Transaction.findOne({ idempotencyKey });
                if (winner) {
                    return sendResponse(
                        res,
                        200,
                        winner,
                        'Offline payment already recorded (concurrent write de-duplicated).'
                    );
                }
            }
            throw err;
        }
    } catch (error: any) {
        console.error('recordOfflinePayment error:', error);
        return sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Payee confirms offline payment. Atomic — guards against double-confirm race.
// @route   PATCH /v1/transactions/:id/confirm-offline
// @access  Protected (payee only)
export const confirmOfflinePayment = async (req: AuthRequest, res: Response) => {
    try {
        // First: load without mutation for authorization + status-transition audit.
        const snapshot = await Transaction.findById(req.params.id).lean();
        if (!snapshot) return sendResponse(res, 404, null, 'Transaction not found');

        if (snapshot.type !== 'offline_record') {
            return sendResponse(res, 400, null, 'This is not an offline transaction');
        }

        if (snapshot.toUserId.toString() !== req.user.id) {
            return sendResponse(res, 403, null, 'Only the payee can confirm this payment');
        }

        // State machine gate. Throws on invalid current status.
        try {
            validateTransition(snapshot.status, 'confirmed', 'offline');
        } catch (e: any) {
            return sendResponse(res, 409, null, e.message);
        }

        // Atomic update — prevents the race where two concurrent confirms both pass the
        // `if (!confirmedByPayee)` check before either save() fires. findOneAndUpdate with
        // the guard inside the filter is the standard fix (was bug #MVP-002).
        const now = new Date();
        const updated = await Transaction.findOneAndUpdate(
            {
                _id: req.params.id,
                type: 'offline_record',
                toUserId: req.user.id,
                confirmedByPayee: { $ne: true },
                status: { $in: ['recorded', 'created'] }, // accept legacy 'created' for back-compat with pre-fix rows
            },
            {
                $set: {
                    confirmedByPayee: true,
                    confirmedAt: now,
                    status: 'confirmed',
                },
                $push: {
                    timeline: {
                        event: 'offline_confirmed',
                        at: now,
                        metadata: { confirmedBy: req.user.id },
                    },
                },
            },
            { new: true }
        );

        if (!updated) {
            // Either: already confirmed, already disputed, or not eligible.
            // Re-read current state to produce a precise message.
            const current = await Transaction.findById(req.params.id).lean();
            const msg = current?.confirmedByPayee
                ? 'Payment already confirmed'
                : `Payment cannot be confirmed from status '${current?.status}'`;
            return sendResponse(res, 409, null, msg);
        }

        return sendResponse(res, 200, updated, 'Offline payment confirmed');
    } catch (error: any) {
        console.error('confirmOfflinePayment error:', error);
        return sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Dispute an offline payment. Guarded by state machine — cannot dispute
//          already-disputed, expired, or completed rows.
// @route   PATCH /v1/transactions/:id/dispute-offline
// @access  Protected (either party)
export const disputeOfflinePayment = async (req: AuthRequest, res: Response) => {
    try {
        const snapshot = await Transaction.findById(req.params.id).lean();
        if (!snapshot) return sendResponse(res, 404, null, 'Transaction not found');

        if (snapshot.type !== 'offline_record') {
            return sendResponse(res, 400, null, 'This is not an offline transaction');
        }

        const userId = req.user.id;
        if (snapshot.fromUserId.toString() !== userId && snapshot.toUserId.toString() !== userId) {
            return sendResponse(res, 403, null, 'Not authorized');
        }

        // State machine gate — rejects dispute on already-disputed, expired, completed rows.
        try {
            validateTransition(snapshot.status, 'disputed', 'offline');
        } catch (e: any) {
            return sendResponse(res, 409, null, e.message);
        }

        const now = new Date();
        const updated = await Transaction.findOneAndUpdate(
            {
                _id: req.params.id,
                type: 'offline_record',
                status: { $in: ['recorded', 'created', 'confirmed'] }, // confirmed→disputed allowed per state machine
            },
            {
                $set: { status: 'disputed' },
                $push: {
                    timeline: {
                        event: 'offline_disputed',
                        at: now,
                        metadata: {
                            disputedBy: userId,
                            reason: String(req.body?.reason ?? '').slice(0, 500),
                        },
                    },
                },
            },
            { new: true }
        );

        if (!updated) {
            return sendResponse(res, 409, null, 'Transaction not eligible for dispute');
        }

        return sendResponse(res, 200, updated, 'Offline payment disputed');
    } catch (error: any) {
        console.error('disputeOfflinePayment error:', error);
        return sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};
