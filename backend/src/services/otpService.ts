import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { HttpError } from '../utils/http';
import { env } from '../config/env';

export interface PendingRegistration {
  name: string;
  email: string;
  passwordHash: string;
  otpHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

// In-memory pending registrations keyed by normalized lowercase email
const pendingRegistrations = new Map<string, PendingRegistration>();

// Periodic cleanup of expired records every 5 minutes
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [email, record] of pendingRegistrations.entries()) {
    if (record.expiresAt < now) {
      pendingRegistrations.delete(email);
    }
  }
}, 5 * 60 * 1000);
cleanupInterval.unref(); // Do not block Node event loop

/**
 * Computes a secure HMAC-SHA256 hash of the OTP code
 */
export const hashOtp = (otp: string): string => {
  const secret = env.jwtSecret || 'pricewise_otp_secure_secret_fallback';
  return crypto.createHmac('sha256', secret).update(otp).digest('hex');
};

/**
 * Generates a cryptographically secure 6-digit numeric OTP
 */
export const generateNumericOtp = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Stores a pending registration and generates a new OTP
 */
export const createPendingRegistration = async (params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ otp: string; expiresAt: Date }> => {
  const normalizedEmail = params.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(params.password, 10);
  const otp = generateNumericOtp();
  const otpHash = hashOtp(otp);
  const now = Date.now();

  pendingRegistrations.set(normalizedEmail, {
    name: params.name.trim(),
    email: normalizedEmail,
    passwordHash,
    otpHash,
    expiresAt: now + OTP_EXPIRY_MS,
    attempts: 0,
    lastSentAt: now,
  });

  return {
    otp,
    expiresAt: new Date(now + OTP_EXPIRY_MS),
  };
};

/**
 * Resends a registration OTP respecting the 60-second cooldown
 */
export const resendRegistrationOtp = async (email: string): Promise<{ otp: string; expiresAt: Date }> => {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = pendingRegistrations.get(normalizedEmail);

  if (!existing) {
    throw new HttpError(404, 'No pending registration found for this email. Please sign up again.');
  }

  const now = Date.now();
  const timeSinceLastSent = now - existing.lastSentAt;
  if (timeSinceLastSent < RESEND_COOLDOWN_MS) {
    const secondsRemaining = Math.ceil((RESEND_COOLDOWN_MS - timeSinceLastSent) / 1000);
    throw new HttpError(429, `Please wait ${secondsRemaining}s before requesting a new code.`);
  }

  const otp = generateNumericOtp();
  existing.otpHash = hashOtp(otp);
  existing.expiresAt = now + OTP_EXPIRY_MS;
  existing.attempts = 0;
  existing.lastSentAt = now;

  return {
    otp,
    expiresAt: new Date(now + OTP_EXPIRY_MS),
  };
};

/**
 * Verifies the OTP code for a pending registration.
 * On success, removes the pending record and returns user details to be persisted.
 */
export const verifyRegistrationOtp = async (
  email: string,
  submittedOtp: string,
): Promise<{ name: string; email: string; passwordHash: string }> => {
  const normalizedEmail = email.trim().toLowerCase();
  const record = pendingRegistrations.get(normalizedEmail);

  if (!record) {
    throw new HttpError(400, 'No pending registration found or the verification code has expired. Please sign up again.');
  }

  const now = Date.now();
  if (record.expiresAt < now) {
    pendingRegistrations.delete(normalizedEmail);
    throw new HttpError(400, 'Verification code has expired. Please request a new code.');
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    pendingRegistrations.delete(normalizedEmail);
    throw new HttpError(429, 'Too many invalid attempts. For your security, this code has been invalidated. Please register again.');
  }

  const cleanOtp = submittedOtp.trim().replace(/\s+/g, '');
  const submittedHash = hashOtp(cleanOtp);

  // Timing-safe comparison to prevent timing attacks
  const submittedBuffer = Buffer.from(submittedHash, 'hex');
  const storedBuffer = Buffer.from(record.otpHash, 'hex');
  const isMatch = submittedBuffer.length === storedBuffer.length && crypto.timingSafeEqual(submittedBuffer, storedBuffer);

  if (!isMatch) {
    record.attempts += 1;
    const remaining = MAX_ATTEMPTS - record.attempts;
    if (remaining <= 0) {
      pendingRegistrations.delete(normalizedEmail);
      throw new HttpError(400, 'Invalid verification code. Maximum attempts exceeded. Please register again.');
    }
    throw new HttpError(400, `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
  }

  // Verification successful: consume and clear single-use OTP
  pendingRegistrations.delete(normalizedEmail);

  return {
    name: record.name,
    email: record.email,
    passwordHash: record.passwordHash,
  };
};

/**
 * For testing and inspection
 */
export const getPendingRegistration = (email: string): PendingRegistration | undefined => {
  return pendingRegistrations.get(email.trim().toLowerCase());
};

export const clearAllPendingRegistrations = (): void => {
  pendingRegistrations.clear();
};
