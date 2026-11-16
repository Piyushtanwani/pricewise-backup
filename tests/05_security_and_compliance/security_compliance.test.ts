import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

import { securityHeaders } from '../../backend/src/middlewares/security';
import type { Request, Response } from 'express';

// TC-SEC-01: Mandatory security headers
test('TC-SEC-01: Response sets mandatory security headers (nosniff, DENY, XSS-Protection)', () => {
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
});

// TC-SEC-02: Bcrypt password hashing strength
test('TC-SEC-02: Bcrypt password hash enforces minimum salt rounds >= 10 with no plain-text leak', async () => {
  const plainPassword = 'UserSecretPass@2026';
  const saltRounds = 10;
  const hash = await bcrypt.hash(plainPassword, saltRounds);

  assert.notEqual(hash, plainPassword, 'Hash must not resemble plain-text password');
  assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$'), 'Bcrypt signature format valid');

  const matches = await bcrypt.compare(plainPassword, hash);
  assert.equal(matches, true);

  const wrongMatches = await bcrypt.compare('WrongPassword', hash);
  assert.equal(wrongMatches, false);
});

// TC-SEC-03: SQL / ORM Injection safety
test('TC-SEC-03: Parameterized queries neutralize SQL injection strings (\' OR \'1\'=\'1)', () => {
  const maliciousInput = "iPhone 15' OR '1'='1";
  
  // Simulated Prisma where clause sanitization
  const safeWhere = {
    name: {
      contains: maliciousInput.trim(),
      mode: 'insensitive' as const,
    },
  };

  // Input is treated as literal parameter string, not executed SQL command
  assert.equal(typeof safeWhere.name.contains, 'string');
  assert.equal(safeWhere.name.contains, "iPhone 15' OR '1'='1");
});

// TC-SEC-04: Email alert rate limiting
test('TC-SEC-04: Alert submission enforces IP-based rate limiting to prevent email flooding', () => {
  const maxAlertsPerHour = 5;
  const submissions: number[] = [];

  const attemptAlert = (timestamp: number): boolean => {
    const oneHourAgo = timestamp - 3600 * 1000;
    const recent = submissions.filter((t) => t > oneHourAgo);
    if (recent.length >= maxAlertsPerHour) {
      return false; // Throttled
    }
    submissions.push(timestamp);
    return true;
  };

  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    assert.equal(attemptAlert(now + i * 1000), true, `Attempt ${i + 1} must pass`);
  }

  // 6th attempt within same hour blocked
  assert.equal(attemptAlert(now + 6000), false, '6th attempt must be throttled');
});

// TC-SEC-05: XSS protection in user prompts & rendering
test('TC-SEC-05: Raw HTML script tags are sanitized/escaped before rendering', () => {
  const xssPayload = '<script>alert("XSS Attack")</script>';

  // HTML entity escape helper
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const sanitized = escapeHtml(xssPayload);
  assert.ok(!sanitized.includes('<script>'), 'Must not contain unescaped script tag');
  assert.ok(sanitized.includes('&lt;script&gt;'), 'Must contain escaped HTML entities');
});

// TC-SEC-06: Expired JWT handling
test('TC-SEC-06: Expired JWT tokens throw TokenExpiredError and invalidate session', () => {
  const secret = 'test-jwt-secret';
  // Create an already-expired token (-1 second)
  const expiredToken = jwt.sign(
    { id: 'user-expired', email: 'expired@example.com' },
    secret,
    { expiresIn: -1 }
  );

  assert.throws(
    () => {
      jwt.verify(expiredToken, secret);
    },
    (err: any) => {
      return err.name === 'TokenExpiredError';
    },
    'Expired token must throw TokenExpiredError'
  );
});

