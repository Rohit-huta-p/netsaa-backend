import express from 'express';
import { searchGigs } from '../controllers/search';

const router = express.Router();

router.get('/gigs', searchGigs);

export default router;
