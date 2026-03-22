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
app.use(
    cors({
        origin: [
            'http://localhost:8081',
            'https://netsaa.onrender.com',
            'https://netsaa.com',
        ],
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
