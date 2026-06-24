import dotenv from 'dotenv';
import connectDB from './config/db';
import app from './app';
import { initSocketServer } from './sockets';
import { startNotificationWorker } from './notifications';
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

    // Start email worker
    startEmailWorker();
    console.log('Email worker started');
});
