import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import gigsRoutes from './routes/gigs';

dotenv.config();

connectDB();

const app: Application = express();

app.use(cors({ origin: ['http://localhost:8081', 'https://netsaa.onrender.com'], credentials: true, allowedHeaders: ['Content-Type', 'Authorization'], exposedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', "PATCH"], optionsSuccessStatus: 200 }));
app.use(express.json());

// API Versioning
app.use('/v1', gigsRoutes);
import searchRoutes from './routes/search';
app.use('/v1/search', searchRoutes);
import aiRoutes from './routes/ai';
app.use('/v1/ai', aiRoutes);

const PORT = process.env.PORT || 5002;

app.listen(PORT, () => console.log(`Gigs service running on port ${PORT}`));
