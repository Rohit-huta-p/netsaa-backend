import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import { createHttpTerminator } from 'http-terminator';
import app from './app';
// Centralized config imports
import { env, connectMongo, connectRedis, disconnectMongo, disconnectRedis } from './config';

const PORT = env.PORT;

const startServer = async () => {
    await connectMongo();
    await connectMongo();
    // await connectRedis();

    const server = http.createServer(app);
    const httpTerminator = createHttpTerminator({ server });

    server.listen(PORT, () => {
        console.log(`[search-service] running on port ${PORT}`);
    });

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
        console.log(`Received ${signal}. Shutting down gracefully...`);
        try {
            await httpTerminator.terminate();
            console.log('HTTP server closed.');

            // await disconnectRedis();
            await disconnectMongo();

            process.exit(0);
        } catch (error) {
            console.error('Error during shutdown:', error);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
