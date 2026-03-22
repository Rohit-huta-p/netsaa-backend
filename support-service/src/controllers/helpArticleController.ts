import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import { HelpArticle } from '../models/HelpArticle';
import { buildArticleSearchPipeline, buildArticleFallbackFilter } from '../utils/articleRanking';
import { articleCache } from '../utils/articleCache';
import {
    createArticleSchema,
    updateArticleSchema,
    searchArticlesSchema,
} from '../utils/validators';

// ─── Tab → filter mapping ───
const TAB_FILTERS: Record<string, { audience?: string; category?: string }> = {
    artist: { audience: 'artist' },
    organizer: { audience: 'organizer' },
    payments: { category: 'payments' },
    safety: { category: 'safety' },
};

// ─── Search / List Articles (with caching) ───
export const searchArticles = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = searchArticlesSchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({
                meta: { status: 400, message: 'Invalid query params' },
                errors: parsed.error.issues,
            });
        }

        const { q, audience, category, page, limit, tab } = parsed.data;
        const skip = (page - 1) * limit;

        // Resolve tab-based filter overrides
        const tabFilter = tab ? TAB_FILTERS[tab] || {} : {};
        const effectiveAudience = tabFilter.audience || audience;
        const effectiveCategory = tabFilter.category || category;

        // Check cache
        const cacheParams = { q, audience: effectiveAudience, category: effectiveCategory, page, limit };
        const cached = await articleCache.get<any>(cacheParams);
        if (cached) {
            return res.json({
                meta: { status: 200, message: 'Articles retrieved (cached)', ...cached.meta },
                data: cached.data,
            });
        }

        let articles: any[];
        let total: number;

        if (q) {
            // ─── Atlas Search pipeline ───
            try {
                const pipeline = buildArticleSearchPipeline(q, {
                    audience: effectiveAudience,
                    category: effectiveCategory,
                });

                // Add pagination
                pipeline.push({ $skip: skip });
                pipeline.push({ $limit: limit });

                // Project out heavy fields for list view
                pipeline.push({
                    $project: {
                        title: 1,
                        slug: 1,
                        category: 1,
                        audience: 1,
                        excerpt: 1,
                        tags: 1,
                        viewCount: 1,
                        updatedAt: 1,
                        score: 1,
                        finalScore: 1,
                    },
                });

                articles = await HelpArticle.aggregate(pipeline);
                total = articles.length < limit ? skip + articles.length : skip + limit + 1; // Estimate
            } catch (searchError) {
                // Fallback to regex if Atlas Search index not configured
                console.warn('[Articles] Atlas Search unavailable, using fallback:', searchError);
                const filter = buildArticleFallbackFilter({ audience: effectiveAudience, category: effectiveCategory, query: q });
                [articles, total] = await Promise.all([
                    HelpArticle.find(filter)
                        .select('title slug category audience excerpt tags viewCount updatedAt')
                        .sort({ viewCount: -1, updatedAt: -1 })
                        .skip(skip)
                        .limit(limit)
                        .lean(),
                    HelpArticle.countDocuments(filter),
                ]);
            }
        } else {
            // ─── No search query — use regular Mongoose filter ───
            const filter = buildArticleFallbackFilter({ audience: effectiveAudience, category: effectiveCategory });
            [articles, total] = await Promise.all([
                HelpArticle.find(filter)
                    .select('title slug category audience excerpt tags viewCount updatedAt')
                    .sort({ updatedAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                HelpArticle.countDocuments(filter),
            ]);
        }

        const responseData = {
            meta: { pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
            data: articles,
        };

        // Cache the response (60s TTL)
        await articleCache.set(cacheParams, responseData);

        res.json({
            meta: { status: 200, message: 'Articles retrieved', ...responseData.meta },
            data: articles,
        });
    } catch (error: any) {
        console.error('searchArticles error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── Get Article by Slug (Preview API) ───
export const getArticleBySlug = async (req: AuthRequest, res: Response) => {
    try {
        const { slug } = req.params;

        // Check cache
        const cached = await articleCache.get<any>({ slug });
        if (cached) {
            return res.json({ meta: { status: 200, message: 'Article retrieved (cached)' }, data: cached });
        }

        const article = await HelpArticle.findOne({ slug, isPublished: true })
            .populate('relatedArticles', 'title slug category audience excerpt')
            .lean();

        if (!article) {
            return res.status(404).json({
                meta: { status: 404, message: 'Article not found' },
            });
        }

        // Increment view count (fire and forget)
        HelpArticle.findByIdAndUpdate(article._id, { $inc: { viewCount: 1 } }).exec();

        // Cache
        await articleCache.set({ slug }, article);

        res.json({
            meta: { status: 200, message: 'Article retrieved' },
            data: article,
        });
    } catch (error: any) {
        console.error('getArticleBySlug error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── Get Article Preview (short version) ───
export const getArticlePreview = async (req: AuthRequest, res: Response) => {
    try {
        const { slug } = req.params;

        const article = await HelpArticle.findOne({ slug, isPublished: true })
            .select('title slug category audience excerpt tags updatedAt')
            .lean();

        if (!article) {
            return res.status(404).json({
                meta: { status: 404, message: 'Article not found' },
            });
        }

        res.json({
            meta: { status: 200, message: 'Article preview' },
            data: article,
        });
    } catch (error: any) {
        console.error('getArticlePreview error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── Create Article (Admin) ───
export const createArticle = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createArticleSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                meta: { status: 400, message: 'Validation error' },
                errors: parsed.error.issues,
            });
        }

        const data = parsed.data;

        // Convert relatedArticles string IDs to ObjectIds
        const relatedArticles = data.relatedArticles.map(
            (id) => new mongoose.Types.ObjectId(id)
        );

        const article = await HelpArticle.create({
            ...data,
            relatedArticles,
        });

        // Invalidate cache
        await articleCache.invalidate();

        res.status(201).json({
            meta: { status: 201, message: 'Article created' },
            data: article,
        });
    } catch (error: any) {
        console.error('createArticle error:', error);
        if (error.code === 11000) {
            return res.status(409).json({
                meta: { status: 409, message: 'Slug already exists' },
                errors: [{ message: 'An article with this slug already exists' }],
            });
        }
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── Update Article (Admin) ───
export const updateArticle = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateArticleSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                meta: { status: 400, message: 'Validation error' },
                errors: parsed.error.issues,
            });
        }

        const article = await HelpArticle.findByIdAndUpdate(
            req.params.id,
            { $set: parsed.data },
            { new: true, runValidators: true }
        );

        if (!article) {
            return res.status(404).json({
                meta: { status: 404, message: 'Article not found' },
            });
        }

        // Invalidate cache
        await articleCache.invalidate();

        res.json({
            meta: { status: 200, message: 'Article updated' },
            data: article,
        });
    } catch (error: any) {
        console.error('updateArticle error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};

// ─── Delete Article (Admin) ───
export const deleteArticle = async (req: AuthRequest, res: Response) => {
    try {
        const article = await HelpArticle.findByIdAndDelete(req.params.id);
        if (!article) {
            return res.status(404).json({
                meta: { status: 404, message: 'Article not found' },
            });
        }

        await articleCache.invalidate();

        res.json({
            meta: { status: 200, message: 'Article deleted' },
        });
    } catch (error: any) {
        console.error('deleteArticle error:', error);
        res.status(500).json({
            meta: { status: 500, message: 'Internal server error' },
            errors: [{ message: error.message }],
        });
    }
};
