import express from 'express';
import { searchEvents } from '../controllers/search';

const router = express.Router();

router.get('/events', searchEvents);

export default router;
