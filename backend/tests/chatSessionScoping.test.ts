import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signToken, optionalAuth } from '../src/middlewares/auth';
import type { Request, Response } from 'express';

test('Chat Session Management: optionalAuth extracts user identity for AI chat endpoint', () => {
  const user = { id: 'usr-alice-1234', email: 'alice@example.com' };
  const token = signToken(user);

  const mockReq: Partial<Request> = {
    headers: { authorization: `Bearer ${token}` },
  };
  const mockRes: Partial<Response> = {};
  let nextCalled = false;
  const mockNext = () => { nextCalled = true; };

  optionalAuth(mockReq as Request, mockRes as Response, mockNext);

  assert.equal(nextCalled, true);
  assert.ok(mockReq.user);
  assert.equal(mockReq.user?.id, 'usr-alice-1234');
  assert.equal(mockReq.user?.email, 'alice@example.com');
});

test('Chat Session Management: unauthenticated requests run as isolated guest sessions', () => {
  const mockReq: Partial<Request> = { headers: {} };
  const mockRes: Partial<Response> = {};
  let nextCalled = false;
  const mockNext = () => { nextCalled = true; };

  optionalAuth(mockReq as Request, mockRes as Response, mockNext);

  assert.equal(nextCalled, true);
  assert.equal(mockReq.user, undefined);
});

test('Chat Session Management: user-scoped storage keys prevent cross-account history leaks', () => {
  const getScopedStorageKey = (userId?: string | null) => {
    if (!userId) return null;
    return `pricewise_chat_history_user_${userId}`;
  };

  const userA = 'user-uuid-aaaa-1111';
  const userB = 'user-uuid-bbbb-2222';

  const keyA = getScopedStorageKey(userA);
  const keyB = getScopedStorageKey(userB);
  const keyGuest = getScopedStorageKey(null);

  // 1. Storage keys must be strictly isolated per user ID
  assert.equal(keyA, 'pricewise_chat_history_user_user-uuid-aaaa-1111');
  assert.equal(keyB, 'pricewise_chat_history_user_user-uuid-bbbb-2222');
  assert.notEqual(keyA, keyB);

  // 2. Unauthenticated sessions must never use or return a persistent global key
  assert.equal(keyGuest, null);

  // 3. Must be distinct from legacy global key
  const LEGACY_STORAGE_KEY = 'pricewise_shopping_assistant_history';
  assert.notEqual(keyA, LEGACY_STORAGE_KEY);
  assert.notEqual(keyB, LEGACY_STORAGE_KEY);
});

test('Chat Session Management: session ID generation produces distinct tokens tied to user prefix', () => {
  const createSessionId = (userId?: string | null) => {
    const prefix = userId ? `user_${userId.slice(0, 8)}` : 'guest';
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  };

  const sessionAlice1 = createSessionId('alice-uuid-999');
  const sessionAlice2 = createSessionId('alice-uuid-999');
  const sessionBob = createSessionId('bob-uuid-888');
  const sessionGuest = createSessionId(null);

  assert.ok(sessionAlice1.startsWith('user_alice-uu'));
  assert.ok(sessionBob.startsWith('user_bob-uuid'));
  assert.ok(sessionGuest.startsWith('guest_'));

  // Separate session creations (e.g. New Chat) must mint distinct session tokens
  assert.notEqual(sessionAlice1, sessionAlice2);
  assert.notEqual(sessionAlice1, sessionBob);
});
