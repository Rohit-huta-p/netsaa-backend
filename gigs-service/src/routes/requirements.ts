// src/routes/requirements.ts
import express from 'express';
import { protect } from '../middleware/auth';
import {
    createRequirement,
    getMyRequirements,
    getRequirementsFeed,
    getRequirementById,
    editRequirement,
    changeRequirementStatus,
} from '../controllers/requirementController';
import {
    createProposal,
    getProposalsForRequirement,
    getMyProposals,
    patchProposal,
} from '../controllers/proposalController';

const router = express.Router();

router.route('/requirements').post(protect, createRequirement).get(protect, getRequirementsFeed);
router.route('/requirements/mine').get(protect, getMyRequirements);
router.route('/requirements/:id').get(protect, getRequirementById).patch(protect, editRequirement);
router.route('/requirements/:id/status').patch(protect, changeRequirementStatus);
router.route('/requirements/:id/proposals')
    .post(protect, createProposal)
    .get(protect, getProposalsForRequirement);
// Lead's own sent proposals — declared before '/proposals/:id' for clarity.
router.route('/proposals/mine').get(protect, getMyProposals);
router.route('/proposals/:id').patch(protect, patchProposal);

export default router;
