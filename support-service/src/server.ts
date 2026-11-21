import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import supportRoutes from './routes/tickets';
import internalRoutes from './routes/internal';
import articleRoutes from './routes/articles';

dotenv.config();

connectDB();

const app: Application = express();

// ─── CORS ───
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
const CORS_ORIGINS = [
    'http://localhost:8081',
    'https://netsaa.onrender.com',
    'https://netsaa.com',
    'https://www.netsaa.com',
];
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            return callback(null, CORS_ORIGINS.includes(origin) || isPagesPreviewOrigin(origin));
        },
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Type', 'Authorization'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        optionsSuccessStatus: 200,
    })
);

app.use(express.json());

// ─── Health Check ───
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'support-service', timestamp: new Date().toISOString() });
});

// ─── API Routes ───
app.use('/api/support', supportRoutes);
app.use('/api/support/articles', articleRoutes);
app.use('/api/support/internal', internalRoutes);

// ─── Server ───
const PORT = process.env.PORT || 5006;

app.listen(PORT, () => console.log(`Support service running on port ${PORT}`));

export default app;
