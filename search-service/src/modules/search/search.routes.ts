import { Router } from 'express';
import { searchController } from './search.controller';

const router = Router();

// LinkedIn-style Search Routes

// 1. Unified Preview (Top search bar, typing)
router.get('/preview', searchController.previewSearch.bind(searchController));

// 2. Vertical-specific Search (Tab clicks)
router.get('/people', searchController.searchPeople.bind(searchController));
router.get('/gigs', searchController.searchGigs.bind(searchController));
router.get('/events', searchController.searchEvents.bind(searchController));

export const searchRoutes = router;
