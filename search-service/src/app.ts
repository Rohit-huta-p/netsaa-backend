import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';

const app: Express = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: ['http://localhost:8081', 'https://netsaa.onrender.com'], credentials: true, allowedHeaders: ['Content-Type', 'Authorization'], exposedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], optionsSuccessStatus: 200 }));
app.use(morgan('dev'));
app.use(express.json());

import { searchRoutes } from './modules/search/search.routes';

// Routes
// Routes
app.use('/search', searchRoutes);
app.use('/v1/search', searchRoutes); // Alias for consistency

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
