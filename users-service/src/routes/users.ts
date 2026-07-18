import express from 'express';
import { getUserById } from '../controllers/users.controller';
import { protect } from '../middleware/auth';
import { getDirectory } from '../controllers/directory.controller';
import { saveTalent, unsaveTalent, getSavedTalent, getSavedIds } from '../controllers/savedTalent.controller';
import { recordProfileView, getMyProfileViews } from '../controllers/profileView.controller';

const router = express.Router();

// GET /api/users/directory — MUST be above /:id so 'directory' is not captured as an id param
router.get('/directory', protect, getDirectory);

// Saved talent — MUST be above /:id so 'saved' is not captured as an id param.
router.get('/saved', protect, getSavedTalent);
router.get('/saved/ids', protect, getSavedIds);
router.post('/saved', protect, saveTalent);
router.delete('/saved/:talentId', protect, unsaveTalent);

// Profile views — MUST be above /:id so 'me'/:id are not misrouted.
router.get('/me/profile-views', protect, getMyProfileViews);
router.post('/:id/view', protect, recordProfileView);

// GET /api/users/:id
router.get('/:id', getUserById);

export default router;
