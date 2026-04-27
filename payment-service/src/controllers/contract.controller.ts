import { Response, NextFunction } from 'express';
import Contract from '../models/Contract';
import { AuthRequest } from '../middleware/auth';
import {
    createContractSchema,
    signContractSchema,
    amendContractSchema,
    respondAmendmentSchema,
    switchPaymentMethodSchema,
} from '../validators/contract.dto';
import { calculateFees } from '../services/fee.service';
import { validateTransition } from '../utils/stateMachine';
import { computeContractHash } from '../utils/contractHash';

const sendResponse = (res: Response, status: number, data: any = null, message: string = 'OK', errors: any[] = []) => {
    res.status(status).json({ meta: { status, message }, data, errors });
};

/**
 * Determine contract tier based on amount (PRD v4 section 9.3)
 * Quick: < Rs.10,000
 * Standard: Rs.10,000 - Rs.1,00,000
 * Premium: > Rs.1,00,000
 */
function determineTier(amount: number): 'quick' | 'standard' | 'premium' {
    if (amount < 10000) return 'quick';
    if (amount <= 100000) return 'standard';
    return 'premium';
}

// @desc    Create a new contract
// @route   POST /v1/contracts
// @access  Protected (hirer)
export const createContract = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const parsed = createContractSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendResponse(res, 400, null, 'Validation failed', parsed.error.issues);
        }

        const { gigId, artistId, terms, paymentMethod } = parsed.data;
        const hirerId = req.user.id;

        if (hirerId === artistId) {
            return sendResponse(res, 400, null, 'Cannot create a contract with yourself');
        }

        // Check for existing active contract for this gig+artist
        const existing = await Contract.findOne({
            gigId,
            artistId,
            status: { $nin: ['declined', 'cancelled', 'breached'] },
        });
        if (existing) {
            // Surface the existing contract id so the frontend can deep-link to
            // it instead of showing a dead-end error. Status is included so the
            // UI can tailor the recovery copy (e.g. "already accepted" vs "sent").
            return sendResponse(
                res,
                409,
                { existingContractId: String(existing._id), status: existing.status },
                'An active contract already exists for this gig and artist'
            );
        }

        // Calculate fees (default to 'new' tier, will be updated when we fetch artist trust)
        const fees = calculateFees(terms.amount, 'gig_payment', 'new');
        const tier = determineTier(terms.amount);

        const sealedTerms = {
            ...terms,
            platformFeeRate: fees.rate,
            platformFeeAmount: fees.platformFee,
            artistReceives: fees.artistReceives,
        };

        const contract = await Contract.create({
            gigId,
            hirerId,
            artistId,
            tier,
            status: 'sent', // Skip draft, go straight to sent
            paymentMethod,
            terms: sealedTerms,
            hirerSignature: {
                signedAt: new Date(),
                deviceInfo: req.headers['user-agent'],
                ipAddress: req.ip,
                signerRole: 'hirer',
            },
            contractHash: computeContractHash(sealedTerms),
        });

        sendResponse(res, 201, contract, 'Contract created and sent to artist');
    } catch (error: any) {
        console.error('createContract error:', error);
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Get contract by ID
// @route   GET /v1/contracts/:id
// @access  Protected (parties only)
export const getContract = async (req: AuthRequest, res: Response) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return sendResponse(res, 404, null, 'Contract not found');

        // Only parties can view
        const userId = req.user.id;
        if (contract.hirerId.toString() !== userId && contract.artistId.toString() !== userId) {
            return sendResponse(res, 403, null, 'Not authorized to view this contract');
        }

        sendResponse(res, 200, contract);
    } catch (error: any) {
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Get all contracts for current user
// @route   GET /v1/users/me/contracts
// @query   ?limit=N — dashboard shorthand: capped at 200; when present it
//         overrides pageSize + skips paging (page=1, ignores skip). Keeps
//         existing ?page/?pageSize behaviour for the full contracts screen.
// @access  Protected
export const getUserContracts = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, pageSize = 20 } = req.query;

        const query: any = {
            $or: [{ hirerId: userId }, { artistId: userId }],
        };
        if (status) query.status = status;

        const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || 0, 0), 200);

        let contractsQuery = Contract.find(query).sort({ createdAt: -1 });
        if (limit > 0) {
            // Dashboard mode: first N, no skip.
            contractsQuery = contractsQuery.limit(limit);
        } else {
            contractsQuery = contractsQuery
                .skip((Number(page) - 1) * Number(pageSize))
                .limit(Number(pageSize));
        }
        const contracts = await contractsQuery;

        const total = await Contract.countDocuments(query);

        sendResponse(res, 200, {
            contracts,
            total,
            page: limit > 0 ? 1 : Number(page),
            pageSize: limit > 0 ? limit : Number(pageSize),
        });
    } catch (error: any) {
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Artist signs/accepts contract
// @route   PATCH /v1/contracts/:id/sign
// @access  Protected (artist only)
//
// Hardening (PRD v4 §8.3.2 / §9.3):
//   1. Tamper detection: recompute contractHash over current terms and compare
//      with the hash sealed at creation. Mismatch → 409, never sign.
//   2. Age-gate (Indian Contract Act §11): if the artist JWT says isMinor,
//      block 'accepted' and transition to 'pending_guardian_cosign' instead.
//      Guardian cosign endpoint (Slice 6) promotes the state to 'accepted'.
//   3. Ceremony audit: persist scrollEndedAt / doubleConfirmedAt / biometric
//      timestamps from the signing UI so disputes can verify intent.
export const signContract = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = signContractSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendResponse(res, 400, null, 'Validation failed', parsed.error.issues);
        }

        const contract = await Contract.findById(req.params.id);
        if (!contract) return sendResponse(res, 404, null, 'Contract not found');

        if (contract.artistId.toString() !== req.user.id) {
            return sendResponse(res, 403, null, 'Only the artist can sign this contract');
        }

        if (contract.artistSignature?.signedAt) {
            return sendResponse(res, 409, null, 'Contract already signed by artist');
        }

        // 1. Tamper detection — hash must match what was sealed at creation.
        if (contract.contractHash) {
            const freshHash = computeContractHash(contract.terms);
            if (freshHash !== contract.contractHash) {
                return sendResponse(res, 409, null, 'Contract terms tampered — signature rejected');
            }
        }

        // 2. Age-gate. If the signing artist is a minor, the contract moves to
        //    pending_guardian_cosign instead of accepted.
        const isMinor = req.user.isMinor === true;
        const guardianStatus = req.user.guardianStatus;
        const nextStatus = isMinor && guardianStatus !== 'confirmed'
            ? 'pending_guardian_cosign'
            : 'accepted';

        validateTransition(contract.status, nextStatus, 'contract');

        // 3. Capture ceremony audit events alongside the signature.
        contract.artistSignature = {
            signedAt: new Date(),
            deviceInfo: parsed.data.deviceInfo ?? (req.headers['user-agent'] as string) ?? '',
            ipAddress: req.ip,
            otpVerified: parsed.data.otpVerified ?? false,
            signerRole: 'artist',
            scrollEndedAt: parsed.data.scrollEndedAt ? new Date(parsed.data.scrollEndedAt) : undefined,
            doubleConfirmedAt: parsed.data.doubleConfirmedAt ? new Date(parsed.data.doubleConfirmedAt) : undefined,
            biometricPassedAt: parsed.data.biometricPassedAt ? new Date(parsed.data.biometricPassedAt) : undefined,
        };
        contract.status = nextStatus;

        await contract.save();

        const message = nextStatus === 'pending_guardian_cosign'
            ? 'Contract signed — awaiting guardian co-signature'
            : 'Contract signed by artist';
        sendResponse(res, 200, contract, message);
    } catch (error: any) {
        if (error.message?.startsWith('Invalid transition')) {
            return sendResponse(res, 400, null, error.message);
        }
        console.error('signContract error:', error);
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Switch payment method before artist signs
// @route   PATCH /v1/contracts/:id/payment-method
// @access  Protected (hirer only)
//
// Per PRD §8.3.2 Stage 2: hirer can swap on_platform ↔ off_platform up until
// the artist countersigns. After that, the switch requires an amendment round
// (so both parties re-agree). paymentMethod is not part of contractHash, so no
// hash recompute is needed.
export const switchPaymentMethod = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = switchPaymentMethodSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendResponse(res, 400, null, 'Validation failed', parsed.error.issues);
        }

        const contract = await Contract.findById(req.params.id);
        if (!contract) return sendResponse(res, 404, null, 'Contract not found');

        if (contract.hirerId.toString() !== req.user.id) {
            return sendResponse(res, 403, null, 'Only the hirer can switch payment method');
        }

        if (contract.artistSignature?.signedAt) {
            return sendResponse(res, 409, null, 'Artist has already signed — use an amendment to change payment method');
        }

        if (contract.paymentMethod === parsed.data.paymentMethod) {
            return sendResponse(res, 200, contract, 'Payment method unchanged');
        }

        contract.paymentMethod = parsed.data.paymentMethod;
        await contract.save();

        sendResponse(res, 200, contract, 'Payment method switched');
    } catch (error: any) {
        console.error('switchPaymentMethod error:', error);
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Artist declines contract
// @route   PATCH /v1/contracts/:id/decline
// @access  Protected (artist only)
export const declineContract = async (req: AuthRequest, res: Response) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return sendResponse(res, 404, null, 'Contract not found');

        if (contract.artistId.toString() !== req.user.id) {
            return sendResponse(res, 403, null, 'Only the artist can decline this contract');
        }

        validateTransition(contract.status, 'declined', 'contract');

        contract.status = 'declined';
        await contract.save();

        sendResponse(res, 200, contract, 'Contract declined');
    } catch (error: any) {
        if (error.message.startsWith('Invalid transition')) {
            return sendResponse(res, 400, null, error.message);
        }
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Request amendment to contract
// @route   POST /v1/contracts/:id/amend
// @access  Protected (either party)
export const requestAmendment = async (req: AuthRequest, res: Response) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return sendResponse(res, 404, null, 'Contract not found');

        const userId = req.user.id;
        if (contract.hirerId.toString() !== userId && contract.artistId.toString() !== userId) {
            return sendResponse(res, 403, null, 'Not authorized');
        }

        if (contract.amendments.length >= 5) {
            return sendResponse(res, 400, null, 'Maximum 5 amendments allowed per contract');
        }

        const parsed = amendContractSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendResponse(res, 400, null, 'Validation failed', parsed.error.issues);
        }

        contract.amendments.push({
            number: contract.amendments.length + 1,
            requestedBy: userId,
            requestedAt: new Date(),
            changes: parsed.data.changes,
            reason: parsed.data.reason,
            status: 'pending',
        });

        await contract.save();

        sendResponse(res, 200, contract, 'Amendment requested');
    } catch (error: any) {
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Respond to amendment
// @route   PATCH /v1/contracts/:id/amendments/:num
// @access  Protected (other party)
export const respondToAmendment = async (req: AuthRequest, res: Response) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return sendResponse(res, 404, null, 'Contract not found');

        const amendmentNum = parseInt(req.params.num as string);
        const amendment = contract.amendments.find(a => a.number === amendmentNum);
        if (!amendment) return sendResponse(res, 404, null, 'Amendment not found');

        if (amendment.requestedBy.toString() === req.user.id) {
            return sendResponse(res, 400, null, 'Cannot respond to your own amendment');
        }

        const parsed = respondAmendmentSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendResponse(res, 400, null, 'Validation failed', parsed.error.issues);
        }

        amendment.status = parsed.data.status;
        amendment.respondedAt = new Date();
        amendment.respondedBy = req.user.id;

        // If accepted, apply changes to terms
        if (parsed.data.status === 'accepted' && amendment.changes) {
            Object.assign(contract.terms, amendment.changes);

            // Recalculate fees if amount changed
            if (amendment.changes.amount) {
                const fees = calculateFees(contract.terms.amount, 'gig_payment', 'new');
                contract.terms.platformFeeRate = fees.rate;
                contract.terms.platformFeeAmount = fees.platformFee;
                contract.terms.artistReceives = fees.artistReceives;
                contract.tier = determineTier(contract.terms.amount);
            }

            contract.contractHash = computeContractHash(contract.terms);
        }

        await contract.save();

        sendResponse(res, 200, contract, `Amendment ${parsed.data.status}`);
    } catch (error: any) {
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};
