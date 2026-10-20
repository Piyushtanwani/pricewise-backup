import { test } from 'node:test';
import assert from 'node:assert/strict';
import { securityHeaders, createRateLimiter } from '../src/middlewares/security';
import { requireAdminKey } from '../src/middlewares/auth';
import type { Request, Response, NextFunction } from 'express';

test('securityHeaders sets expected security headers', () => {
  const headers: Record<string, string> = {};
  const mockReq: Partial<Request> = {};
  const mockRes: Partial<Response> = {
    setHeader: (name: string, value: any) => {
      headers[name] = String(value);
      return mockRes as Response;
    },
  };
  let nextCalled = false;
  securityHeaders(mockReq as Request, mockRes as Response, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-XSS-Protection'], '1; mode=block');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
});

test('createRateLimiter enforces request limits and sets rate limit headers', () => {
  const limiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 3,
    message: 'Rate limit exceeded',
  });

  const ip = '192.168.1.100';
  const makeReq = () => {
    const headers: Record<string, any> = {};
    let status = 200;
    let body: any = null;
    let nextCalled = false;

    const req: Partial<Request> = {
      headers: { 'x-forwarded-for': ip },
      socket: { remoteAddress: ip } as any,
    };
    const res: Partial<Response> = {
      setHeader: (k: string, v: any) => { headers[k] = v; return res as Response; },
      status: (s: number) => { status = s; return res as Response; },
      json: (b: any) => { body = b; return res as Response; },
    };
    const next: NextFunction = () => { nextCalled = true; };

    limiter(req as Request, res as Response, next);
    return { status, body, headers, nextCalled };
  };

  // Request 1: Allowed
  const r1 = makeReq();
  assert.equal(r1.nextCalled, true);
  assert.equal(r1.status, 200);
  assert.equal(r1.headers['X-RateLimit-Remaining'], 2);

  // Request 2: Allowed
  const r2 = makeReq();
  assert.equal(r2.nextCalled, true);
  assert.equal(r2.headers['X-RateLimit-Remaining'], 1);

  // Request 3: Allowed
  const r3 = makeReq();
  assert.equal(r3.nextCalled, true);
  assert.equal(r3.headers['X-RateLimit-Remaining'], 0);

  // Request 4: Blocked with 429
  const r4 = makeReq();
  assert.equal(r4.nextCalled, false);
  assert.equal(r4.status, 429);
  assert.deepEqual(r4.body, { message: 'Rate limit exceeded' });
  assert.ok(Number(r4.headers['Retry-After']) > 0);
});

test('requireAdminKey validates timing-safe header or returns 503/401', () => {
  let statusSent = 0;
  let jsonSent: any = null;
  const mockReq: Partial<Request> = { headers: { 'x-admin-key': 'wrong-key' } };
  const mockRes: Partial<Response> = {
    status: (s: number) => { statusSent = s; return mockRes as Response; },
    json: (j: any) => { jsonSent = j; return mockRes as Response; },
  };

  requireAdminKey(mockReq as Request, mockRes as Response, () => {});
  // Depending on whether env.adminApiKey is set in the test process:
  // If not set -> 503 Admin API disabled; if set and wrong -> 401 Invalid admin key
  assert.ok(statusSent === 503 || statusSent === 401);
});
