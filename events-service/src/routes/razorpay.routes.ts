import { Router, raw } from 'express';
import { handleRazorpayWebhook } from '../controllers/razorpayWebhook.controller';

const router = Router();

// Razorpay sends application/json — we need RAW bytes for signature validation.
// express.raw() preserves Buffer; controller decodes via toString('utf8').
router.post('/webhook', raw({ type: 'application/json' }), handleRazorpayWebhook);

export default router;
