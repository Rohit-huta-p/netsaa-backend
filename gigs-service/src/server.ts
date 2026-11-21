import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import gigsRoutes from './routes/gigs';
import requirementRoutes from './routes/requirements';
import inviteRoutes from './routes/invites';
import internalRoutes from './routes/internal';

dotenv.config();

connectDB();

const app: Application = express();

// Allow our Cloudflare Pages project host + preview subdomains
// (<branch|commit>.<project>.pages.dev). Only our own Pages project serves that
// host, so reflecting it with credentials is safe. Override with PAGES_PREVIEW_HOST.
const PAGES_PREVIEW_HOST = process.env.PAGES_PREVIEW_HOST || 'netsaa-frontend.pages.dev';
function isPagesPreviewOrigin(origin: string): boolean {
    try {
        const host = new URL(origin).hostname;
        return host === PAGES_PREVIEW_HOST || host.endsWith(`.${PAGES_PREVIEW_HOST}`);
    } catch {
        return false;
    }
}
const CORS_ORIGINS = ['http://localhost:8081', 'http://localhost:8085', 'https://netsaa.onrender.com', 'https://netsaa.com', 'https://www.netsaa.com'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, CORS_ORIGINS.includes(origin) || isPagesPreviewOrigin(origin));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    optionsSuccessStatus: 200,
}));
app.use(express.json());

// Internal service-to-service routes (no CORS, token-gated)
app.use('/internal', internalRoutes);

// API Versioning
app.use('/v1', gigsRoutes);
app.use('/v1', requirementRoutes);
app.use('/v1', inviteRoutes);
import searchRoutes from './routes/search';
app.use('/v1/search', searchRoutes);
import aiRoutes from './routes/ai';
app.use('/v1/ai', aiRoutes);

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => console.log(`Gigs service running on port ${PORT}`));
