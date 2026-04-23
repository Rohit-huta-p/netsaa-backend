import express, { Application } from 'express';
import cors from 'cors';
import gigsRoutes from './routes/gigs';
import searchRoutes from './routes/search';
import aiRoutes from './routes/ai';

const app: Application = express();

app.use(cors({ origin: ['http://localhost:8081', 'https://netsaa.onrender.com', 'https://netsaa.com'], credentials: true, allowedHeaders: ['Content-Type', 'Authorization'], exposedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', "PATCH"], optionsSuccessStatus: 200 }));
app.use(express.json());

// API Versioning
app.use('/v1', gigsRoutes);
app.use('/v1/search', searchRoutes);
app.use('/v1/ai', aiRoutes);

export default app;
