import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: any;
}

/**
 * PRD v4 Two-Context Auth Middleware
 * Copied from gigs-service pattern. No role checks, just JWT verification.
 */
export const protect = async (req: AuthRequest, res: Response, next: NextFunction) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
            const userPayload = decoded.user || decoded;
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
        }
    }
    next();
};
