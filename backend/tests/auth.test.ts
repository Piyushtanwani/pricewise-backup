import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { signToken, authenticateToken, optionalAuth, currentUserId } from '../src/middlewares/auth';
import type { Request, Response, NextFunction } from 'express';

test('signToken generates valid JWT and can be decoded', () => {
  const user = { id: 'user_123', email: 'test@example.com' };
  const token = signToken(user);
  assert.ok(typeof token === 'string' && token.length > 20);

  // Mock Request with valid token
  let nextCalled = false;
  const mockReq: Partial<Request> = {
    headers: { authorization: `Bearer ${token}` },
  };
  const mockRes: Partial<Response> = {
    status: () => mockRes as Response,
    json: () => mockRes as Response,
  };
  const mockNext: NextFunction = () => { nextCalled = true; };

  authenticateToken(mockReq as Request, mockRes as Response, mockNext);
  assert.equal(nextCalled, true);
  assert.equal(mockReq.user?.id, 'user_123');
  assert.equal(mockReq.user?.email, 'test@example.com');
  assert.equal(currentUserId(mockReq as Request), 'user_123');
});

test('authenticateToken rejects missing token with 401', () => {
  let statusSent = 0;
  let jsonSent: any = null;
  const mockReq: Partial<Request> = { headers: {} };
  const mockRes: Partial<Response> = {
    status: (s: number) => { statusSent = s; return mockRes as Response; },
    json: (j: any) => { jsonSent = j; return mockRes as Response; },
  };
  const mockNext: NextFunction = () => { assert.fail('next should not be called'); };

  authenticateToken(mockReq as Request, mockRes as Response, mockNext);
  assert.equal(statusSent, 401);
  assert.deepEqual(jsonSent, { message: 'No token provided' });
});

test('authenticateToken rejects malformed or invalid token with 401', () => {
  let statusSent = 0;
  let jsonSent: any = null;
  const mockReq: Partial<Request> = {
    headers: { authorization: 'Bearer invalid.token.signature' },
  };
  const mockRes: Partial<Response> = {
    status: (s: number) => { statusSent = s; return mockRes as Response; },
    json: (j: any) => { jsonSent = j; return mockRes as Response; },
  };
  const mockNext: NextFunction = () => { assert.fail('next should not be called'); };

  authenticateToken(mockReq as Request, mockRes as Response, mockNext);
  assert.equal(statusSent, 401);
  assert.deepEqual(jsonSent, { message: 'Invalid or expired token' });
});

test('optionalAuth attaches user if valid token present, but does not reject if missing', () => {
  const user = { id: 'user_456', email: 'guest@example.com' };
  const token = signToken(user);

  let nextCalled = false;
  const mockReqWithToken: Partial<Request> = {
    headers: { authorization: `Bearer ${token}` },
  };
  optionalAuth(mockReqWithToken as Request, {} as Response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(mockReqWithToken.user?.id, 'user_456');

  // Anonymous request
  let anonNextCalled = false;
  const mockReqAnon: Partial<Request> = { headers: {} };
  optionalAuth(mockReqAnon as Request, {} as Response, () => { anonNextCalled = true; });
  assert.equal(anonNextCalled, true);
  assert.equal(mockReqAnon.user, undefined);
});

test('password hashing and verification with bcrypt', async () => {
  const plain = 'SecurePassword123!';
  const hash = await bcrypt.hash(plain, 10);
  assert.ok(hash !== plain);
  assert.ok(hash.startsWith('$2'));

  const isValid = await bcrypt.compare(plain, hash);
  assert.equal(isValid, true);

  const isWrong = await bcrypt.compare('WrongPassword', hash);
  assert.equal(isWrong, false);
});
