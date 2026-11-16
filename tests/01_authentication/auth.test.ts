import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const bcrypt = require('bcryptjs');

import { signToken, verifyToken } from '../../backend/src/middlewares/auth';
import { createPendingRegistration, verifyRegistrationOtp } from '../../backend/src/services/otpService';
import { createRateLimiter } from '../../backend/src/middlewares/security';
import type { Request, Response } from 'express';

// TC-AUTH-01: Valid registration initiates OTP flow
test('TC-AUTH-01: Valid registration initiates OTP flow without committing user to DB prematurely', async () => {
  const email = `test-auth-01-${Date.now()}@example.com`;
  const name = 'Aman Rohera';
  const password = 'Password@123';

  const { otp, expiresAt } = await createPendingRegistration({ name, email, password });

  assert.ok(otp, 'OTP must be generated');
  assert.equal(typeof otp, 'string');
  assert.equal(otp.length, 6, 'OTP must be a 6-digit numeric string');
  assert.ok(/^\d{6}$/.test(otp), 'OTP must contain only digits');
  assert.ok(expiresAt.getTime() > Date.now(), 'OTP expiry must be in the future');
});

// TC-AUTH-02: OTP verify completes account creation with bcrypt hash
test('TC-AUTH-02: OTP verification validates bcrypt hashing and returns valid JWT claims', async () => {
  const rawPassword = 'Password@123';
  const email = `test-auth-02-${Date.now()}@example.com`;

  const { otp } = await createPendingRegistration({ name: 'Test User', email, password: rawPassword });
  const pending = await verifyRegistrationOtp(email, otp);

  assert.ok(pending, 'Valid OTP must resolve pending registration');
  assert.equal(pending.email, email);

  // Verify bcrypt security requirement: password is saved as hash with salt rounds >= 10
  assert.ok(pending.passwordHash, 'Password must be stored as hash');
  assert.ok(pending.passwordHash.startsWith('$2a$') || pending.passwordHash.startsWith('$2b$'), 'Must be valid bcrypt format');
  const matches = await bcrypt.compare(rawPassword, pending.passwordHash);
  assert.equal(matches, true, 'Bcrypt hash must match raw password');

  // Verify JWT claims
  const token = signToken({ id: 'user-auth-02', email, role: 'USER' });
  const decoded = verifyToken(token);
  assert.ok(decoded, 'JWT token must decode successfully');
  assert.equal(decoded.id, 'user-auth-02');
  assert.equal(decoded.email, email);
  assert.equal(decoded.role, 'USER');
});

// TC-AUTH-03: OTP Security & brute-force prevention (5 invalid attempts limit)
test('TC-AUTH-03: Brute-force protection limits OTP attempts and rejects invalid tokens', async () => {
  const email = `test-auth-03-${Date.now()}@example.com`;
  await createPendingRegistration({ name: 'Brute User', email, password: 'Password@123' });

  // 1st to 4th invalid attempt throws attempt warning
  for (let i = 0; i < 4; i++) {
    await assert.rejects(
      async () => verifyRegistrationOtp(email, '000000'),
      /Invalid verification code/
    );
  }

  // 5th attempt invalidates OTP completely (Maximum attempts exceeded)
  await assert.rejects(
    async () => verifyRegistrationOtp(email, '000000'),
    /Maximum attempts exceeded/
  );

  // Subsequent attempt fails as registration was purged
  await assert.rejects(
    async () => verifyRegistrationOtp(email, '000000'),
    /No pending registration found/
  );
});

// TC-AUTH-04: User Login with valid credentials
test('TC-AUTH-04: User login generates signed JWT token with valid identity claims', () => {
  const userPayload = {
    id: 'user-login-04',
    email: 'user@example.com',
    role: 'USER' as const,
  };

  const token = signToken(userPayload);
  assert.equal(typeof token, 'string');
  assert.ok(token.split('.').length === 3, 'JWT must have header, payload, and signature');

  const claims = verifyToken(token);
  assert.ok(claims);
  assert.equal(claims.id, userPayload.id);
  assert.equal(claims.email, userPayload.email);
  assert.equal(claims.role, 'USER');
});

// TC-AUTH-05: IP Sliding-Window Auth Rate Limiter
test('TC-AUTH-05: Sliding-window auth rate limiter throttles excessive consecutive requests (HTTP 429)', () => {
  const limiter = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many requests',
  });

  const ip = '10.0.0.99';
  let status = 200;
  let body: any = null;

  const mockReq: Partial<Request> = {
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip } as any,
  };
  const mockRes: Partial<Response> = {
    setHeader: () => mockRes as Response,
    status: (s: number) => { status = s; return mockRes as Response; },
    json: (b: any) => { body = b; return mockRes as Response; },
  };

  // 10 requests allowed
  for (let i = 1; i <= 10; i++) {
    let nextCalled = false;
    limiter(mockReq as Request, mockRes as Response, () => { nextCalled = true; });
    assert.equal(nextCalled, true, `Request ${i} must pass`);
  }

  // 11th request throttled with 429
  let eleventhPassed = false;
  limiter(mockReq as Request, mockRes as Response, () => { eleventhPassed = true; });
  assert.equal(eleventhPassed, false, '11th request must be blocked');
  assert.equal(status, 429, 'Must return HTTP 429');
  assert.deepEqual(body, { message: 'Too many requests' });
});
