import express from 'express';
import { protect } from '../middleware/auth';
import {
    initiatePayment,
    confirmPayment,
    getTransaction,
    getUserTransactions,
    getUserPaymentStats,
} from '../controllers/transaction.controller';
import {
    recordOfflinePayment,
    confirmOfflinePayment,
    disputeOfflinePayment,
} from '../controllers/offline.controller';

const router = express.Router();

// On-platform payments
router.post('/transactions/initiate', protect, initiatePayment);
router.post('/transactions/confirm', protect, confirmPayment);

// Transaction queries
router.get('/transactions/:id', protect, getTransaction);
router.get('/users/me/transactions', protect, getUserTransactions);

// Payment stats (for trust engine)
router.get('/users/:userId/payment-stats', protect, getUserPaymentStats);

// Offline payments
router.post('/transactions/offline', protect, recordOfflinePayment);
router.patch('/transactions/:id/confirm-offline', protect, confirmOfflinePayment);
router.patch('/transactions/:id/dispute-offline', protect, disputeOfflinePayment);

export default router;
