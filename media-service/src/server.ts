// ============================================================
// MEDIA-SERVICE ENTRY POINT
// ============================================================
// Load environment configuration FIRST (validates and fails fast)
import { env } from './config';

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import mediaRoutes from './routes/media.routes';

// ============================================================
// EXPRESS APP
// ============================================================

const app: Application = express();

// Security middleware
app.use(helmet());

// CORS
const corsOptions = {
    origin: env.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (development only)
if (env.isDevelopment) {
    app.use((req: Request, res: Response, next: NextFunction) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        next();
    });
}

// ============================================================
// ROUTES
// ============================================================

// API v1 routes
app.use('/v1/media', mediaRoutes);

// Root health check
app.get('/', (req: Request, res: Response) => {
    res.json({
        service: env.serviceName,
        version: '1.0.0',
        status: 'running',
        environment: env.nodeEnv,
    });
});

// ============================================================
// ERROR HANDLING
// ============================================================

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found`,
    });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(`[${env.serviceName}] Unhandled error:`, err);
    res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: env.isProduction ? 'An unexpected error occurred' : err.message,
    });
});

// ============================================================
// DATABASE CONNECTION
// ============================================================

async function connectDatabase(): Promise<void> {
    try {
        await mongoose.connect(env.mongoUri);
        console.log(`✅ [MongoDB] Connected successfully`);
    } catch (error) {
        console.error('❌ [MongoDB] Connection failed:', error);
        process.exit(1);
    }
}

// ============================================================
// SERVER STARTUP
// ============================================================

async function startServer(): Promise<void> {
    await connectDatabase();

    app.listen(env.port, () => {
        console.log(`🚀 [${env.serviceName}] Running on port ${env.port}`);
        console.log(`   Environment: ${env.nodeEnv}`);
        console.log(`   S3 Bucket: ${env.aws.bucket}`);
    });
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

const shutdown = async (signal: string) => {
    console.log(`\n⏳ Received ${signal}. Shutting down gracefully...`);
    try {
        await mongoose.disconnect();
        console.log('✅ MongoDB disconnected');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught Exception:', error);
    process.exit(1);
});

// Start the server
startServer();

export default app;
