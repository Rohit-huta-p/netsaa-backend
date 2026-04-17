import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import Contract from '../models/Contract';
import { AuthRequest } from '../middleware/auth';
import { createContractSchema, signContractSchema, amendContractSchema, respondAmendmentSchema } from '../validators/contract.dto';
import { calculateFees } from '../services/fee.service';
import { validateTransition } from '../utils/stateMachine';

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

        const { gigId, artistId, terms } = parsed.data;
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
            return sendResponse(res, 409, null, 'An active contract already exists for this gig and artist');
        }

        // Calculate fees (default to 'new' tier, will be updated when we fetch artist trust)
        const fees = calculateFees(terms.amount, 'gig_payment', 'new');
        const tier = determineTier(terms.amount);

        const contract = await Contract.create({
            gigId,
            hirerId,
            artistId,
            tier,
            status: 'sent', // Skip draft, go straight to sent
            terms: {
                ...terms,
                platformFeeRate: fees.rate,
                platformFeeAmount: fees.platformFee,
                artistReceives: fees.artistReceives,
            },
            hirerSignature: {
                signedAt: new Date(),
                deviceInfo: req.headers['user-agent'],
            },
            contractHash: crypto.createHash('sha256').update(JSON.stringify(terms)).digest('hex'),
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
// @access  Protected
export const getUserContracts = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { status, page = 1, pageSize = 20 } = req.query;

        const query: any = {
            $or: [{ hirerId: userId }, { artistId: userId }],
        };
        if (status) query.status = status;

        const contracts = await Contract.find(query)
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(pageSize))
            .limit(Number(pageSize));

        const total = await Contract.countDocuments(query);

        sendResponse(res, 200, { contracts, total, page: Number(page), pageSize: Number(pageSize) });
    } catch (error: any) {
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Artist signs/accepts contract
// @route   PATCH /v1/contracts/:id/sign
// @access  Protected (artist only)
export const signContract = async (req: AuthRequest, res: Response) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return sendResponse(res, 404, null, 'Contract not found');

        if (contract.artistId.toString() !== req.user.id) {
            return sendResponse(res, 403, null, 'Only the artist can sign this contract');
        }

        validateTransition(contract.status, 'accepted', 'contract');

        const parsed = signContractSchema.safeParse(req.body);

        contract.status = 'accepted';
        contract.artistSignature = {
            signedAt: new Date(),
            deviceInfo: parsed.success ? parsed.data.deviceInfo : (req.headers['user-agent'] as string || ''),
            otpVerified: parsed.success ? parsed.data.otpVerified : false,
        };

        await contract.save();

        sendResponse(res, 200, contract, 'Contract signed by artist');
    } catch (error: any) {
        if (error.message.startsWith('Invalid transition')) {
            return sendResponse(res, 400, null, error.message);
        }
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

            contract.contractHash = crypto.createHash('sha256').update(JSON.stringify(contract.terms)).digest('hex');
        }

        await contract.save();

        sendResponse(res, 200, contract, `Amendment ${parsed.data.status}`);
    } catch (error: any) {
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};
