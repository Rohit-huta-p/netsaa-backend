import dotenv from 'dotenv';
import connectDB from './config/db';
import app from './app';
import { initSocketServer } from './sockets';
import { startNotificationWorker } from './notifications';
import { startEventNotificationWorker } from './notifications/notification.worker';
import { subClient } from './sockets/socket.redis';
import { startEmailWorker } from './email/email.worker';

dotenv.config();

connectDB();

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

    // Start Plan 6/8 cross-service event notification worker (event.* subtypes)
    if (subClient) {
        startEventNotificationWorker(subClient);
    } else {
        console.warn('[EventNotificationWorker] subClient unavailable — Plan 6/8 event subtypes will not be delivered');
    }

    // Start email worker
    startEmailWorker();
    console.log('Email worker started');
});
