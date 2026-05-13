import { Router } from 'express';
import { protect } from '../middleware/auth';
import { requireOrganizer } from '../middleware/ownerOnly';
import { getRoster } from '../controllers/roster.controller';
import { exportRosterCsv } from '../controllers/csvExport.controller';

const router = Router({ mergeParams: true });

router.get('/roster', protect, requireOrganizer, getRoster);
router.get('/roster.csv', protect, requireOrganizer, exportRosterCsv);

export default router;
