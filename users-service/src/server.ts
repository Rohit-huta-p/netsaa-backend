import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import authRoutes from './routes/auth';
import connectionsRoutes from './connections/connections.routes';
import conversationsRoutes from './connections/conversations.routes';
import messagesRoutes from './connections/messages.routes';
import { initSocketServer } from './sockets';

dotenv.config();

connectDB();

const app: Application = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/messages', messagesRoutes);

const PORT = process.env.PORT || 5001;
console.log("Welcome to user's service");

const server = app.listen(PORT, () => {
    console.log(`Users service running on port ${PORT}`);

    // Initialize Socket.IO
    initSocketServer(server);
    console.log('Socket.IO initialized');
});

