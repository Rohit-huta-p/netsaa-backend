import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requireServiceToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = process.env.INTERNAL_SERVICE_TOKEN || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid service token' });
    return;
  }
  next();
}
