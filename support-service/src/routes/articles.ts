import express from 'express';
import { protect, requireAdmin } from '../middleware/auth';
import {
    searchArticles,
    getArticleBySlug,
    getArticlePreview,
    createArticle,
    updateArticle,
    deleteArticle,
} from '../controllers/helpArticleController';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────
// Public (authenticated) endpoints
// GET  /api/support/articles          → Search / list articles
// GET  /api/support/articles/:slug    → Full article by slug
// GET  /api/support/articles/:slug/preview → Article preview
//
// Admin-only endpoints
// POST   /api/support/articles          → Create article
// PATCH  /api/support/articles/:id      → Update article
// DELETE /api/support/articles/:id      → Delete article
// ─────────────────────────────────────────────────────────────────

router.get('/', protect, searchArticles);
router.get('/:slug', protect, getArticleBySlug);
router.get('/:slug/preview', protect, getArticlePreview);

router.post('/', protect, requireAdmin, createArticle);
router.patch('/:id', protect, requireAdmin, updateArticle);
router.delete('/:id', protect, requireAdmin, deleteArticle);

export default router;
