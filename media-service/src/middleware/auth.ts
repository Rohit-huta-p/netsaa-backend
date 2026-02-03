import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config';

// ============================================================
// TYPES
// ============================================================

export type UserRole = 'artist' | 'organizer' | 'admin';

export interface AuthUser {
    id: string;
    role: UserRole;
    email?: string;
}

export interface AuthRequest extends Request {
    user?: AuthUser;
}



// ============================================================
// AUTH MIDDLEWARE
// ============================================================

/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token from Authorization header.
 * Populates req.user with { id, role }.
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Authorization header with Bearer token is required'
        });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, env.jwtSecret) as Record<string, unknown>;

        // Extract user ID (handle different payload shapes)
        // users-service uses { user: { id } } structure
        let userId: string | undefined;

        if (decoded.user && typeof decoded.user === 'object') {
            const userPayload = decoded.user as Record<string, unknown>;
            userId = (userPayload.id || userPayload._id) as string | undefined;
        } else {
            userId = (decoded.id || decoded.userId || decoded._id || decoded.sub) as string | undefined;
        }

        if (!userId || typeof userId !== 'string') {
            res.status(401).json({
                error: 'UNAUTHORIZED',
                message: 'Invalid token payload: missing user ID'
            });
            return;
        }

        // Extract role (optional - users-service may not include it)
        // Default to 'artist' if not present, or fetch from DB if needed
        let role: UserRole = 'artist';
        if (decoded.role && ['artist', 'organizer', 'admin'].includes(decoded.role as string)) {
            role = decoded.role as UserRole;
        } else if (decoded.user && typeof decoded.user === 'object') {
            const userPayload = decoded.user as Record<string, unknown>;
            if (userPayload.role && ['artist', 'organizer', 'admin'].includes(userPayload.role as string)) {
                role = userPayload.role as UserRole;
            }
        }

        req.user = {
            id: userId,
            role: role,
            email: decoded.email as string | undefined,
        };

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({
                error: 'TOKEN_EXPIRED',
                message: 'Token has expired'
            });
            return;
        }

        res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Invalid token'
        });
    }
}

/**
 * Optional auth middleware.
 * Attempts to extract user from token but does not fail if missing.
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, env.jwtSecret) as Record<string, unknown>;
        const userId = decoded.id || decoded.userId || decoded._id || decoded.sub;
        const role = decoded.role as UserRole;

        if (userId && typeof userId === 'string' && role) {
            req.user = {
                id: userId,
                role: role,
                email: decoded.email as string | undefined,
            };
        }
    } catch {
        // Silently ignore invalid tokens for optional auth
    }

    next();
}
