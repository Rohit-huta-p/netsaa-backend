import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import eventRoutes from './routes/eventRoutes';
import searchRoutes from './routes/search';
import internalRoutes from './routes/internal';
import { startReservationExpiryWorker } from './workers/reservationExpiryWorker';
import { startPayHoldExpiryWorker } from './workers/payHoldExpiryWorker';
import { startRefundRetryWorker } from './workers/refundRetryWorker';
import { handleWebhook } from './controllers/razorpayWebhook';
import { handleCashfreeWebhook } from './controllers/cashfreeWebhook';
import './models/User';

dotenv.config();

const app: Application = express();

if (process.env.NODE_ENV !== 'test') {
    connectDB();
}

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
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    optionsSuccessStatus: 200,
}));

// Webhook raw body mount MUST come before express.json() — signature verification requires
// the exact bytes Razorpay signed; JSON.parse would alter them.
app.post('/v1/razorpay/webhook', express.raw({ type: 'application/json' }), handleWebhook);
// Cashfree (active provider) — base64 HMAC over timestamp + raw body; needs the exact bytes.
app.post('/v1/cashfree/webhook', express.raw({ type: 'application/json' }), handleCashfreeWebhook);

app.use(express.json());

// API Versioning
app.use('/v1', eventRoutes);
app.use('/v1/search', searchRoutes);
app.use('/internal', internalRoutes);

const PORT = process.env.PORT || 5003;

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Events service running on port ${PORT}`);
        startReservationExpiryWorker();
        startPayHoldExpiryWorker();
        startRefundRetryWorker();
    });
}

export default app;
