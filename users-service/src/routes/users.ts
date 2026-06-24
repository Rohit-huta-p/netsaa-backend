import express from 'express';
import { getUserById } from '../controllers/users.controller';
import { protect } from '../middleware/auth';
import { getDirectory } from '../controllers/directory.controller';
import { saveTalent, unsaveTalent, getSavedTalent, getSavedIds } from '../controllers/savedTalent.controller';

const router = express.Router();

// GET /api/users/directory — MUST be above /:id so 'directory' is not captured as an id param
router.get('/directory', protect, getDirectory);

// Saved talent — MUST be above /:id so 'saved' is not captured as an id param.
router.get('/saved', protect, getSavedTalent);
router.get('/saved/ids', protect, getSavedIds);
router.post('/saved', protect, saveTalent);
router.delete('/saved/:talentId', protect, unsaveTalent);

// GET /api/users/:id
router.get('/:id', getUserById);

export default router;
