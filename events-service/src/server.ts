import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import eventRoutes from './routes/eventRoutes';
import searchRoutes from './routes/search';
import { startReservationExpiryWorker } from './workers/reservationExpiryWorker';
import './models/User';

dotenv.config();

const app: Application = express();

if (process.env.NODE_ENV !== 'test') {
    connectDB();
}

app.use(cors({ origin: ['http://localhost:8081', 'https://netsaa.onrender.com', 'https://netsaa.com'], credentials: true, allowedHeaders: ['Content-Type', 'Authorization'], exposedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], optionsSuccessStatus: 200 }));
app.use(express.json());

// API Versioning
app.use('/v1', eventRoutes);
app.use('/v1/search', searchRoutes);

const PORT = process.env.PORT || 5003;

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Events service running on port ${PORT}`);
        startReservationExpiryWorker();
    });
}

export default app;
