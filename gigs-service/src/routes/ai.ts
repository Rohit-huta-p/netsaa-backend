import express from 'express';
import { AIController } from '../controllers/aiController';

const router = express.Router();

// POST /v1/ai/rephrase
router.post('/rephrase', AIController.rephraseText);

export default router;
