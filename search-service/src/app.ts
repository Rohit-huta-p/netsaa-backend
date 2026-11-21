import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

const app: Express = express();

// Middleware
app.use(helmet());
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
const CORS_ORIGINS = ['http://localhost:8081', 'https://netsaa.onrender.com', 'https://netsaa.com', 'https://www.netsaa.com'];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, CORS_ORIGINS.includes(origin) || isPagesPreviewOrigin(origin));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 200,
}));
app.use(morgan('dev'));
app.use(express.json());

import { searchRoutes } from './modules/search/search.routes';
import pymkRoutes from './pymk/pymk.routes';
import similarRoutes from './similar/similar.routes';

// Routes
app.use('/search', searchRoutes);
app.use('/v1/search', searchRoutes); // Alias for consistency
app.use('/discover', pymkRoutes);   // GET /discover/pymk
app.use('/pymk', pymkRoutes);       // POST /pymk/dismiss
app.use('/discover', similarRoutes); // GET /discover/similar/:id

app.get('/search/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'search-service' });
});

// 404 Handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
});

// Global Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

export default app;
