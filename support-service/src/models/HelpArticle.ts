import mongoose, { Schema, Document } from 'mongoose';

// ─── Interface ───
export interface IHelpArticle extends Document {
    title: string;
    slug: string;
    category: 'getting_started' | 'payments' | 'gigs' | 'events' | 'account' | 'safety' | 'technical';
    audience: 'artist' | 'organizer' | 'all';
    content: string;           // Markdown
    excerpt?: string;          // Short preview (auto-generated or manual)
    tags: string[];
    relatedArticles: mongoose.Types.ObjectId[];
    isPublished: boolean;
    viewCount: number;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Schema ───
const HelpArticleSchema = new Schema<IHelpArticle>(
    {
        title: { type: String, required: true },
        slug: { type: String, required: true, unique: true, index: true },

        category: {
            type: String,
            enum: ['getting_started', 'payments', 'gigs', 'events', 'account', 'safety', 'technical'],
            required: true,
            index: true,
        },

        audience: {
            type: String,
            enum: ['artist', 'organizer', 'all'],
            default: 'all',
            required: true,
            index: true,
        },

        content: { type: String, required: true },
        excerpt: { type: String },
        tags: { type: [String], index: true },

        relatedArticles: [{ type: Schema.Types.ObjectId, ref: 'HelpArticle' }],

        isPublished: { type: Boolean, default: false, index: true },
        viewCount: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// ─── Compound Indexes ───
HelpArticleSchema.index({ audience: 1, category: 1, isPublished: 1 });  // Tab-based filter
HelpArticleSchema.index({ isPublished: 1, updatedAt: -1 });              // Latest articles

// ─── Auto-generate excerpt from content if not provided ───
HelpArticleSchema.pre('save', function (next) {
    if (!this.excerpt && this.content) {
        // Strip markdown and take first 200 chars
        const plain = this.content.replace(/[#*_`>\[\]()!-]/g, '').trim();
        this.excerpt = plain.substring(0, 200) + (plain.length > 200 ? '...' : '');
    }
    next();
});

// ─── Auto-generate slug from title if not provided ───
HelpArticleSchema.pre('save', function (next) {
    if (this.isNew && this.title && !this.slug) {
        this.slug = this.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 100);
    }
    next();
});

/*
 * ─── Atlas Search Index Definition ───
 * Create this index in MongoDB Atlas UI or via API:
 *
 * Index Name: "help_articles_search"
 * Collection: "helparticles"
 *
 * {
 *   "mappings": {
 *     "dynamic": false,
 *     "fields": {
 *       "title":    { "type": "string", "analyzer": "lucene.standard" },
 *       "content":  { "type": "string", "analyzer": "lucene.standard" },
 *       "tags":     { "type": "string", "analyzer": "lucene.keyword" },
 *       "category": { "type": "string", "analyzer": "lucene.keyword" },
 *       "audience": { "type": "string", "analyzer": "lucene.keyword" },
 *       "isPublished": { "type": "boolean" },
 *       "viewCount":   { "type": "number" }
 *     }
 *   }
 * }
 */

export const HelpArticle = mongoose.model<IHelpArticle>('HelpArticle', HelpArticleSchema);
export default HelpArticle;
