import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import eventRoutes from './routes/eventRoutes';
import './models/User';

dotenv.config();

connectDB();

const app: Application = express();

app.use(cors({ origin: ['http://localhost:5173', 'https://netsaa.onrender.com'], credentials: true, allowedHeaders: ['Content-Type', 'Authorization'], exposedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], optionsSuccessStatus: 200 }));
app.use(express.json());

// API Versioning
app.use('/v1', eventRoutes);
import searchRoutes from './routes/search';
app.use('/v1/search', searchRoutes);

const PORT = process.env.PORT || 5003;

app.listen(PORT, () => console.log(`Events service running on port ${PORT}`));
