import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../types';

/**
 * Protect routes — requires a valid JWT token.
 */
export const protect = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    let token: string | undefined;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET as string
            ) as any;

            const userPayload = decoded.user || decoded;
            if (!userPayload.role) {
                userPayload.role = 'artist';
            }

            req.user = userPayload;
            return next();
        } catch (error) {
            console.error('Auth token error:', error);
            res.status(401).json({
                meta: { status: 401, message: 'Not authorized, token failed' },
                errors: [{ message: 'Invalid token' }],
            });
            return;
        }
    }

    if (!token) {
        res.status(401).json({
            meta: { status: 401, message: 'Not authorized, no token' },
            errors: [{ message: 'No token provided' }],
        });
        return;
    }
};

/**
 * Require agent or admin role.
 */
export const requireAgent = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (req.user && (req.user.role === 'agent' || req.user.role === 'admin')) {
        return next();
    }
    res.status(403).json({
        meta: { status: 403, message: 'Forbidden: Agent access required' },
        errors: [{ message: 'User is not a support agent' }],
    });
};

/**
 * Require admin role.
 */
export const requireAdmin = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    res.status(403).json({
        meta: { status: 403, message: 'Forbidden: Admin access required' },
        errors: [{ message: 'User is not an admin' }],
    });
};
