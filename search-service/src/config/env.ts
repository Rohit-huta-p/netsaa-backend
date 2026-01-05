import dotenv from 'dotenv';
dotenv.config();

interface EnvConfig {
    PORT: number;
    MONGO_URI: string;
    REDIS_URL: string;
    NODE_ENV: string;
}

const getEnv = (): EnvConfig => {
    const PORT = parseInt(process.env.PORT || '3000', 10);
    const MONGO_URI = process.env.MONGO_URI;
    const REDIS_URL = process.env.REDIS_URL;
    const NODE_ENV = process.env.NODE_ENV || 'development';

    if (!MONGO_URI) {
        throw new Error('FATAL: MONGO_URI is not defined.');
    }

    if (!REDIS_URL) {
        console.warn('WARNING: REDIS_URL is not defined. Caching may fail.');
    }

    return {
        PORT,
        MONGO_URI,
        REDIS_URL: REDIS_URL || '',
        NODE_ENV,
    };
};

export const env = getEnv();
