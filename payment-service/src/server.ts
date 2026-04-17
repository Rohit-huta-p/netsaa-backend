import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import contractRoutes from './routes/contracts';
import transactionRoutes from './routes/transactions';
import webhookRoutes from './routes/webhooks';

dotenv.config();

connectDB();

const app: Application = express();

// CORS config (same across all NETSA services)
app.use(cors({
    origin: [
        'http://localhost:8081',
        'http://localhost:8085',
        'https://netsaa.onrender.com',
        'https://netsaa.com',
        'https://www.netsaa.com',
    ],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    optionsSuccessStatus: 200,
}));

// IMPORTANT: Webhook route MUST be registered BEFORE express.json()
// because it needs the raw body for signature verification
app.use('/v1/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// JSON parsing for all other routes
app.use(express.json());

// API routes
app.use('/v1', contractRoutes);
app.use('/v1', transactionRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'payment-service', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5005;

app.listen(PORT, () => console.log(`Payment service running on port ${PORT}`));
