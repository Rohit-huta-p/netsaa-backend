import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Extend Request interface
export interface AuthRequest extends Request {
    user?: any;
}

export type UserRole = 'artist' | 'organizer' | 'admin';

export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            if (!process.env.JWT_SECRET) {
                console.error("JWT_SECRET is not defined!");
                return res.status(500).json({
                    meta: { status: 500, message: 'Server Configuration Error' },
                    errors: [{ message: 'JWT_SECRET missing' }]
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;

            // Get user from token payload and normalise
            const userPayload = decoded.user || decoded;

            // Ensure role is present, default to 'artist' if missing (backward compatibility)
            if (!userPayload.role) {
                userPayload.role = 'artist';
            }

            req.user = userPayload;

            console.log("User: ", req.user);
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
            if (process.env.JWT_SECRET) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
                req.user = decoded.user || decoded;
            }
        } catch (error) {
            console.error("Optional Auth Token Error:", error);
        }
    }
    next();
};
