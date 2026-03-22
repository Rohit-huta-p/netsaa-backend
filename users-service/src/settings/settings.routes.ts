import express from 'express';
import { protect } from '../middleware/auth';
import { getSettings, updateSettings, updateMarketingConsent } from './settings.controller';

const router = express.Router();

// GET  /users/me/settings  — Retrieve current user settings (normalized with defaults)
router.get('/', protect, getSettings);

// PATCH /users/me/settings — Partial update of user settings
router.patch('/', protect, updateSettings);

// PATCH /users/me/marketing-consent — Update marketing consent (idempotent)
router.patch('/marketing-consent', protect, updateMarketingConsent);

export default router;
