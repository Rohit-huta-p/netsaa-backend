import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import connectionsRoutes from './connections/connections.routes';
import conversationsRoutes from './connections/conversations.routes';
import messagesRoutes from './connections/messages.routes';
import notificationRoutes from './notifications/notification.routes';
import organizerRoutes from './routes/organizer.routes';
import usersRoutes from './routes/users';
import settingsRoutes from './settings/settings.routes';
import securityRoutes from './routes/security.routes';
import dangerRoutes from './routes/danger.routes';

dotenv.config();

const app: Application = express();

app.use(cors({ origin: ['http://localhost:8081', 'https://netsaa.onrender.com'], credentials: true, allowedHeaders: ['Content-Type', 'Authorization'], exposedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], optionsSuccessStatus: 200 }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/organizers', organizerRoutes);
app.use('/api/users/me/settings', settingsRoutes);
app.use('/api/users/me', securityRoutes);
app.use('/api/users/me', dangerRoutes);
app.use('/api/users', usersRoutes);

export default app;
