import mongoose from 'mongoose';
import { env } from './env';

export const connectMongo = async () => {
    const uri = env.MONGO_URI;

    try {
        // Mongoose 6+ / 7+ defaults usually cover standard topology options.
        // Ensure strict query is configured if needed (defaults vary by version).
        mongoose.set('strictQuery', false); // Often needed for search filters flexibility

        await mongoose.connect(uri);
        console.log('[search-service] Connected to MongoDB Atlas');
    } catch (error) {
        console.error('[search-service] Error connecting to MongoDB:', error);
        process.exit(1);
    }
};

export const disconnectMongo = async () => {
    try {
        await mongoose.disconnect();
        console.log('[search-service] Disconnected from MongoDB');
    } catch (error) {
        console.error('[search-service] Error disconnecting from MongoDB:', error);
    }
};
