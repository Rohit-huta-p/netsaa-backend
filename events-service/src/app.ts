import express, { Application } from 'express';
import cors from 'cors';
import eventRoutes from './routes/eventRoutes';
import searchRoutes from './routes/search';
import adminRoutes from './routes/admin.routes';
import eventsRoutesV2 from './routes/events.routes';
import razorpayRoutes from './routes/razorpay.routes';
import './models/User';

const app: Application = express();

app.use(cors({
    origin: ['http://localhost:8081', 'https://netsaa.onrender.com', 'https://netsaa.com'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    optionsSuccessStatus: 200,
}));

// Razorpay webhook FIRST — needs raw body before global json parser strips it
app.use('/api/events/razorpay', razorpayRoutes);

app.use(express.json());

app.use('/v1', eventRoutes);
app.use('/v1/search', searchRoutes);
app.use('/v1/admin/events', adminRoutes);
app.use('/api/events', eventsRoutesV2);   // Task 9 — composer save endpoint

export default app;
