import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config';

// ============================================================
// INTERNAL SERVICE AUTH
// ============================================================
//
// Service-to-service guard for endpoints that trusted siblings call (users-service,
// events-service). The caller presents the shared INTERNAL_SERVICE_TOKEN as a
// Bearer token — this is NOT a user JWT. Used by the media-cleanup endpoint, where
// ownership was already established by the calling service (it only ever sends us
// media that was persisted on the doc it is updating).

function timingSafeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

export function requireInternal(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!token || !timingSafeEqual(token, env.internalServiceToken)) {
        res.status(401).json({ error: 'UNAUTHORIZED', message: 'Valid internal service token required' });
        return;
    }

    next();
}
