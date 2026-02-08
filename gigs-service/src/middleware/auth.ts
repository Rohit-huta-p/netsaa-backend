import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../controllers/gigController';

export type UserRole = 'artist' | 'organizer' | 'admin';

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;

            // Get user from the token
            // In a microservice, we might not have direct database access to Users.
            // We rely on the token payload (if it contains user info) 
            // OR we validly assume the ID is correct if signature matches.
            // The token payload from users-service is { user: { id: ..., role: ... } }
            // We flatten it so req.user.id works as expected.
            const userPayload = decoded.user || decoded;

            // Ensure role is present, default to 'artist' if missing (backward compatibility)
            if (!userPayload.role) {
                userPayload.role = 'artist';
            }

            req.user = userPayload;

            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({
                meta: { status: 401, message: 'Not authorized, token failed' },
                errors: [{ message: 'Invalid token' }]
            });
        }
    }

    if (!token) {
        res.status(401).json({
            meta: { status: 401, message: 'Not authorized, no token' },
            errors: [{ message: 'No token provided' }]
        });
    }
};

export const requireOrganizer = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && (req.user.role === 'organizer' || req.user.role === 'admin')) {
        next();
    } else {
        res.status(403).json({
            meta: { status: 403, message: 'Forbidden: Organizer access required' },
            errors: [{ message: 'User is not an organizer' }]
        });
    }
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
            req.user = decoded.user || decoded;
        } catch (error) {
            console.error("Optional Auth Token Error:", error);
            // Don't fail, just continue as guest
        }
    }
    next();
};
