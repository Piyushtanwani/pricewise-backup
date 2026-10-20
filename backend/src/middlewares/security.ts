import { Request, Response, NextFunction } from 'express';

/**
 * Standard HTTP security headers without requiring external dependencies.
 */
export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
};

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

/**
 * In-memory sliding-window rate limiter per client IP.
 */
export const createRateLimiter = (options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) => {
  const store = new Map<string, RateLimitRecord>();
  const { windowMs, maxRequests, message = 'Too many requests, please try again later.' } = options;

  // Periodically clean up expired entries every 5 minutes
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (record.resetAt <= now) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  cleanupTimer.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // In production or behind proxies, use x-forwarded-for if available
    const rawIp = req.headers['x-forwarded-for'];
    const clientIp = typeof rawIp === 'string'
      ? rawIp.split(',')[0].trim()
      : req.socket.remoteAddress || '127.0.0.1';

    const now = Date.now();
    const record = store.get(clientIp);

    if (!record || record.resetAt <= now) {
      store.set(clientIp, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      next();
      return;
    }

    if (record.count >= maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSec);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.status(429).json({ message });
      return;
    }

    record.count += 1;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    next();
  };
};

// Rate limiter for authentication attempts: 20 requests per 15 minutes
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 25,
  message: 'Too many login or registration attempts. Please try again after 15 minutes.',
});

// Rate limiter for email alert requests: 10 requests per minute
export const emailAlertRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  message: 'Too many price alert requests. Please slow down and try again shortly.',
});
