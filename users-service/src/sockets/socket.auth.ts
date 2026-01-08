import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { SocketData } from './socket.types';

export const socketAuth = async (socket: Socket, next: (err?: Error) => void) => {
    try {
        let token = socket.handshake.auth.token || socket.handshake.query.token;

        // Also check Authorization header if token is not found in auth/query
        if (!token && socket.handshake.headers.authorization) {
            const authHeader = socket.handshake.headers.authorization;
            if (authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
        }

        if (!token) {
            // SECURITY: Deny all connections without a valid token.
            // This ensures no unauthenticated client can consume socket resources or listen to events.
            return next(new Error('Authentication error: No token provided'));
        }

        const decoded: any = jwt.verify(token as string, process.env.JWT_SECRET as string);
        const user = await User.findById(decoded.user.id);

        if (!user) {
            return next(new Error('Authentication error: User not found'));
        }

        // Attach user to socket data using type assertion since we know the structure
        (socket.data as SocketData).user = user;
        next();
    } catch (error) {
        next(new Error('Authentication error: Invalid token'));
    }
};
