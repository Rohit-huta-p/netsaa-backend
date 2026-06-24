import { Response, NextFunction } from 'express';
import Transaction from '../models/Transaction';
import Contract from '../models/Contract';
import { AuthRequest } from '../middleware/auth';
import { initiatePaymentSchema, confirmPaymentSchema } from '../validators/transaction.dto';
import { calculateFees } from '../services/fee.service';
import { validateTransition } from '../utils/stateMachine';
import * as razorpayService from '../services/razorpay.service';

const sendResponse = (res: Response, status: number, data: any = null, message: string = 'OK', errors: any[] = []) => {
    res.status(status).json({ meta: { status, message }, data, errors });
};

// @desc    Initiate a payment (create Razorpay order)
// @route   POST /v1/transactions/initiate
// @access  Protected
export const initiatePayment = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = initiatePaymentSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendResponse(res, 400, null, 'Validation failed', parsed.error.issues);
        }

        const { contractId, paymentStructure } = parsed.data;

        // Fetch contract
        const contract = await Contract.findById(contractId);
        if (!contract) return sendResponse(res, 404, null, 'Contract not found');

        // Only accepted or active contracts can be paid
        if (!['accepted', 'active'].includes(contract.status)) {
            return sendResponse(res, 400, null, `Contract must be accepted to initiate payment. Current status: ${contract.status}`);
        }

        // Only the hirer pays
        if (contract.hirerId.toString() !== req.user.id) {
            return sendResponse(res, 403, null, 'Only the hirer can initiate payment');
        }

        // Calculate amount based on payment structure
        let payAmount = contract.terms.amount;
        let structureSuffix = '';
        if (paymentStructure === 'advance_30') {
            payAmount = Math.round(contract.terms.amount * 0.3);
            structureSuffix = '_advance';
        } else if (paymentStructure === 'balance_70') {
            payAmount = Math.round(contract.terms.amount * 0.7);
            structureSuffix = '_remaining';
        }

        // Deterministic idempotency key (no timestamps)
        const idempotencyKey = `netsa_pay_${contract.gigId}_${contractId}${structureSuffix}`;

        // Check for existing transaction with this key
        const existing = await Transaction.findOne({ idempotencyKey });
        if (existing) {
            if (existing.status === 'created' && existing.razorpayOrderId) {
                // Return existing order for retry
                return sendResponse(res, 200, {
                    transactionId: existing._id,
                    razorpayOrderId: existing.razorpayOrderId,
                    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
                    amount: payAmount,
                    currency: 'INR',
                }, 'Existing order returned (idempotent)');
            }
            if (['paid', 'confirmed', 'completed'].includes(existing.status)) {
                return sendResponse(res, 409, null, 'Payment already processed for this contract');
            }
        }

        // Calculate fees
        const fees = calculateFees(payAmount, 'gig_payment');

        // Create Razorpay order
        const order = await razorpayService.createOrder(
            payAmount,
            'INR',
            idempotencyKey,
            {
                contractId: contractId,
                gigId: contract.gigId.toString(),
                hirerId: contract.hirerId.toString(),
                artistId: contract.artistId.toString(),
            }
        );

        // Create transaction record
        const transaction = await Transaction.create({
            gigId: contract.gigId,
            contractId: contract._id,
            type: 'gig_payment',
            paymentStructure: paymentStructure || 'full',
            layer: 'primary',
            fromUserId: contract.hirerId,
            toUserId: contract.artistId,
            amount: payAmount,
            currency: 'INR',
            platformFee: { rate: fees.rate, amount: fees.platformFee },
            artistReceived: fees.artistReceives,
            razorpayOrderId: order.id,
            idempotencyKey,
            status: 'created',
            timeline: [{ event: 'order_created', at: new Date(), metadata: { orderId: order.id } }],
        });

        sendResponse(res, 201, {
            transactionId: transaction._id,
            razorpayOrderId: order.id,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            amount: payAmount,
            currency: 'INR',
        }, 'Payment order created');
    } catch (error: any) {
        console.error('initiatePayment error:', error);
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Confirm payment after Razorpay checkout
// @route   POST /v1/transactions/confirm
// @access  Protected
export const confirmPayment = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = confirmPaymentSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendResponse(res, 400, null, 'Validation failed', parsed.error.issues);
        }

        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

        // Verify signature
        const isValid = razorpayService.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
        if (!isValid) {
            return sendResponse(res, 400, null, 'Invalid payment signature');
        }

        // Find transaction
        const transaction = await Transaction.findOne({ razorpayOrderId });
        if (!transaction) return sendResponse(res, 404, null, 'Transaction not found');

        // Validate transition
        validateTransition(transaction.status, 'paid', 'transaction');

        // Update transaction
        transaction.status = 'paid';
        transaction.razorpayPaymentId = razorpayPaymentId;
        transaction.timeline.push({
            event: 'payment_confirmed',
            at: new Date(),
            metadata: { paymentId: razorpayPaymentId },
        });

        // TODO: Create Route transfer for instant split
        // This requires the artist to have a linked Razorpay account
        // For MVP/test mode, we skip the actual transfer and just mark as paid
        // In production: await razorpayService.createRouteTransfer(razorpayPaymentId, artistLinkedAccountId, transaction.artistReceived);

        await transaction.save();

        // Update contract status to active if it was accepted
        if (transaction.contractId) {
            const contract = await Contract.findById(transaction.contractId);
            if (contract && contract.status === 'accepted') {
                contract.status = 'active';
                await contract.save();
            }
        }

        // TODO: Call users-service to recalculate trust scores
        // axios.post(`${USERS_SERVICE_URL}/api/users/${transaction.toUserId}/recalculate-trust`)

        sendResponse(res, 200, transaction, 'Payment confirmed successfully');
    } catch (error: any) {
        if (error.message.startsWith('Invalid transition')) {
            return sendResponse(res, 400, null, error.message);
        }
        console.error('confirmPayment error:', error);
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Get single transaction
// @route   GET /v1/transactions/:id
// @access  Protected (parties only)
export const getTransaction = async (req: AuthRequest, res: Response) => {
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return sendResponse(res, 404, null, 'Transaction not found');

        const userId = req.user.id;
        if (transaction.fromUserId.toString() !== userId && transaction.toUserId.toString() !== userId) {
            return sendResponse(res, 403, null, 'Not authorized to view this transaction');
        }

        sendResponse(res, 200, transaction);
    } catch (error: any) {
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Get user's transactions
// @route   GET /v1/users/me/transactions
// @access  Protected
export const getUserTransactions = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { type, status, page = 1, pageSize = 20 } = req.query;

        const query: any = {
            $or: [{ fromUserId: userId }, { toUserId: userId }],
        };
        if (type) query.type = type;
        if (status) query.status = status;

        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(pageSize))
            .limit(Number(pageSize));

        const total = await Transaction.countDocuments(query);

        sendResponse(res, 200, { transactions, total, page: Number(page), pageSize: Number(pageSize) });
    } catch (error: any) {
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};

// @desc    Get payment stats for a user (called by trust engine)
// @route   GET /v1/users/:userId/payment-stats
// @access  Protected
export const getUserPaymentStats = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;

        const completedPayments = await Transaction.countDocuments({
            toUserId: userId,
            status: { $in: ['paid', 'confirmed', 'completed'] },
            type: { $ne: 'offline_record' },
        });

        const totalTransactions = await Transaction.countDocuments({
            $or: [{ fromUserId: userId }, { toUserId: userId }],
            status: { $in: ['paid', 'confirmed', 'completed'] },
        });

        const onPlatformCount = await Transaction.countDocuments({
            $or: [{ fromUserId: userId }, { toUserId: userId }],
            type: { $ne: 'offline_record' },
            status: { $in: ['paid', 'confirmed', 'completed'] },
        });

        const disputeCount = await Transaction.countDocuments({
            $or: [{ fromUserId: userId }, { toUserId: userId }],
            status: 'disputed',
        });

        sendResponse(res, 200, {
            completedPayments,
            totalTransactions,
            onPlatformCount,
            onPlatformRatio: totalTransactions > 0 ? onPlatformCount / totalTransactions : 0,
            disputeCount,
            disputeRate: totalTransactions > 0 ? disputeCount / totalTransactions : 0,
        });
    } catch (error: any) {
        sendResponse(res, 500, null, 'Server error', [{ message: error.message }]);
    }
};
