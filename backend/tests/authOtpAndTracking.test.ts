import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPendingRegistration,
  verifyRegistrationOtp,
  resendRegistrationOtp,
  hashOtp,
  getPendingRegistration,
  clearAllPendingRegistrations,
} from '../src/services/otpService';
import { setTransporterForTesting } from '../src/services/emailService';
import prisma from '../src/utils/prisma';

// Mock email transporter for testing
setTransporterForTesting({
  sendMail: async (options: any) => ({
    messageId: 'test-otp-msg-12345',
    response: '250 OK',
  }),
} as any);

test('OTP Service: generates secure 6-digit OTP and hashes it in memory', async () => {
  clearAllPendingRegistrations();
  const email = 'test_otp_user@example.com';
  const { otp, expiresAt } = await createPendingRegistration({
    name: 'OTP Tester',
    email,
    password: 'Password@123',
  });

  assert.match(otp, /^\d{6}$/, 'OTP must be exactly 6 digits');
  assert.ok(expiresAt.getTime() > Date.now(), 'OTP must have future expiration');

  const record = getPendingRegistration(email);
  assert.ok(record, 'Record must exist in pending store');
  assert.equal(record.email, email);
  assert.equal(record.name, 'OTP Tester');
  assert.notEqual(record.otpHash, otp, 'OTP must NOT be stored in plaintext');
  assert.equal(record.otpHash, hashOtp(otp), 'Hashed OTP must match HMAC-SHA256');
  assert.notEqual(record.passwordHash, 'Password@123', 'Password must be hashed');
});

test('OTP Service: rejects invalid OTP and decrements remaining attempts', async () => {
  clearAllPendingRegistrations();
  const email = 'test_attempts@example.com';
  const { otp } = await createPendingRegistration({
    name: 'Attempts Tester',
    email,
    password: 'Password@123',
  });

  // Attempt with wrong OTP
  await assert.rejects(
    async () => {
      await verifyRegistrationOtp(email, '000000');
    },
    (err: any) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /4 attempts remaining/i);
      return true;
    },
  );

  const record = getPendingRegistration(email);
  assert.equal(record?.attempts, 1);
});

test('OTP Service: invalidates pending registration after maximum failed attempts', async () => {
  clearAllPendingRegistrations();
  const email = 'test_max_attempts@example.com';
  await createPendingRegistration({
    name: 'Max Attempts',
    email,
    password: 'Password@123',
  });

  for (let i = 0; i < 4; i++) {
    try {
      await verifyRegistrationOtp(email, '111111');
    } catch {
      // expected
    }
  }

  // 5th attempt should invalidate
  await assert.rejects(
    async () => {
      await verifyRegistrationOtp(email, '111111');
    },
    (err: any) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /Maximum attempts exceeded/i);
      return true;
    },
  );

  // Store should have removed the invalidated registration
  const record = getPendingRegistration(email);
  assert.equal(record, undefined, 'Invalidated record must be deleted');
});

test('OTP Service: enforces 60-second cooldown on resend', async () => {
  clearAllPendingRegistrations();
  const email = 'test_cooldown@example.com';
  await createPendingRegistration({
    name: 'Cooldown Tester',
    email,
    password: 'Password@123',
  });

  // Immediate resend must be rejected with 429
  await assert.rejects(
    async () => {
      await resendRegistrationOtp(email);
    },
    (err: any) => {
      assert.equal(err.status, 429);
      assert.match(err.message, /Please wait/i);
      return true;
    },
  );
});

test('OTP Service: successfully verifies correct OTP and consumes it (one-time use)', async () => {
  clearAllPendingRegistrations();
  const email = 'test_success@example.com';
  const { otp } = await createPendingRegistration({
    name: 'Success Tester',
    email,
    password: 'Password@123',
  });

  const verified = await verifyRegistrationOtp(email, otp);
  assert.equal(verified.email, email);
  assert.equal(verified.name, 'Success Tester');
  assert.ok(verified.passwordHash.length > 20, 'Password hash must be returned');

  // Second verification must fail (single-use OTP)
  await assert.rejects(
    async () => {
      await verifyRegistrationOtp(email, otp);
    },
    (err: any) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /No pending registration found/i);
      return true;
    },
  );
});

test('Tracking & Alerts: protected endpoints reject unauthenticated requests with 401', async () => {
  // Direct test of controller requiring authenticated user
  const { setPriceNotification } = await import('../src/controllers/userController');
  
  const mockReq: any = {
    user: undefined, // Logged out
    body: {
      productId: 'any-product-id',
      targetPrice: 20000,
      email: 'logged_out@example.com',
    },
  };

  const mockRes: any = {
    status: () => mockRes,
    json: () => mockRes,
  };

  await assert.rejects(
    async () => {
      await setPriceNotification(mockReq, mockRes);
    },
    (err: any) => {
      assert.equal(err.status, 401);
      assert.match(err.message, /Unauthorized|Authentication required/i);
      return true;
    },
  );
});
