import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { SocketData } from './socket.types';

// No DB lookup: the JWT is the credential. If it's valid and unexpired, the user
// existed at login time. Socket handlers only need _id, which is in the token.
// shortcut: a deleted/banned user can keep a live socket until their JWT expires.
//           when to upgrade: add a Redis blocklist keyed on userId to revoke sockets.
export const socketAuth = (socket: Socket, next: (err?: Error) => void) => {
    try {
        let token = socket.handshake.auth.token || socket.handshake.query.token;

        if (!token && socket.handshake.headers.authorization) {
            const authHeader = socket.handshake.headers.authorization;
            if (authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
        }

        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        const decoded: any = jwt.verify(token as string, process.env.JWT_SECRET as string);
        (socket.data as SocketData).user = { _id: decoded.user.id, id: decoded.user.id } as any;
        next();
    } catch {
        next(new Error('Authentication error: Invalid token'));
    }
};
