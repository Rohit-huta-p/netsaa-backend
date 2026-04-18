import express from 'express';
import { protect } from '../middleware/auth';
import {
    createContract,
    getContract,
    getUserContracts,
    signContract,
    declineContract,
    switchPaymentMethod,
    requestAmendment,
    respondToAmendment,
} from '../controllers/contract.controller';

const router = express.Router();

// Contract CRUD
router.post('/contracts', protect, createContract);
router.get('/contracts/:id', protect, getContract);
router.get('/users/me/contracts', protect, getUserContracts);

// Contract lifecycle
router.patch('/contracts/:id/sign', protect, signContract);
router.patch('/contracts/:id/decline', protect, declineContract);
router.patch('/contracts/:id/payment-method', protect, switchPaymentMethod);

// Amendments
router.post('/contracts/:id/amend', protect, requestAmendment);
router.patch('/contracts/:id/amendments/:num', protect, respondToAmendment);

export default router;
