import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'crypto';
import { env } from '../config/env';
import { HttpError } from '../utils/http';
import prisma from '../utils/prisma';

export interface AuthUser {
  id: string;
  email: string;
  role?: 'USER' | 'ADMIN';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const readToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
};

export const verifyToken = (token: string): AuthUser => {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded === 'string' || typeof decoded.id !== 'string' || typeof decoded.email !== 'string') {
    throw new Error('Malformed token payload');
  }
  return { id: decoded.id, email: decoded.email, role: (decoded as any).role };
};
const verify = verifyToken;

export const signToken = (user: AuthUser): string =>
  jwt.sign({ id: user.id, email: user.email, role: user.role || 'USER' }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = readToken(req);
  if (!token) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }
  try {
    req.user = verify(token);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/** Attaches req.user when a valid token is present, but never rejects the request. */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const token = readToken(req);
  if (token) {
    try {
      req.user = verify(token);
    } catch {
      // Anonymous access is allowed; ignore bad tokens here.
    }
  }
  next();
};

/** Returns the authenticated user id; use only behind authenticateToken. */
export const currentUserId = (req: Request): string => {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user.id;
};

export const requireAdminKey = (req: Request, res: Response, next: NextFunction): void => {
  if (!env.adminApiKey) {
    res.status(503).json({ message: 'Admin API is disabled. Set ADMIN_API_KEY to enable it.' });
    return;
  }
  const provided = Buffer.from(String(req.headers['x-admin-key'] ?? ''));
  const expected = Buffer.from(env.adminApiKey);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    res.status(401).json({ message: 'Invalid admin key' });
    return;
  }
  next();
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: 'Unauthorized: Authentication required' });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true, email: true, isBanned: true },
    });
    if (!user || user.isBanned) {
      res.status(403).json({ message: 'Forbidden: Account suspended' });
      return;
    }
    const isAdmin = (user.role as string) === 'ADMIN';
    if (!isAdmin) {
      res.status(403).json({ message: 'Forbidden: Admin access required' });
      return;
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Authorization error' });
  }
};
