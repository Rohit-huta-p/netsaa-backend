import express from 'express';
import { handleRazorpayWebhook } from '../controllers/webhook.controller';

const router = express.Router();

// Razorpay webhook - no auth middleware, signature verified in controller
router.post('/razorpay', handleRazorpayWebhook);

export default router;
