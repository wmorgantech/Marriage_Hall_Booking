import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    const token = header.slice('Bearer '.length).trim();
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: TokenPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
