import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db';
import authRoutes from './routes/auth';
import connectionsRoutes from './connections/connections.routes';
import conversationsRoutes from './connections/conversations.routes';
import messagesRoutes from './connections/messages.routes';
import notificationRoutes from './notifications/notification.routes';
import { initSocketServer } from './sockets';
import { startNotificationWorker } from './notifications';

dotenv.config();

connectDB();

const app: Application = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/users/notifications', notificationRoutes);

const PORT = process.env.PORT || 5001;
console.log("Welcome to user's service");

const server = app.listen(PORT, () => {
    console.log(`Users service running on port ${PORT}`);

    // Initialize Socket.IO
    initSocketServer(server);
    console.log('Socket.IO initialized');

    // Start notification worker
    startNotificationWorker()
        .then(() => console.log('Notification worker started'))
        .catch((err) => console.error('Failed to start notification worker:', err));
});

