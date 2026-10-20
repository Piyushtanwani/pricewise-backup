import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { HttpError } from '../utils/http';
import { requireEmail, requireString } from '../utils/validate';
import { currentUserId, signToken } from '../middlewares/auth';
import { authenticateWithGoogle } from '../services/googleAuthService';

import {
  createPendingRegistration,
  verifyRegistrationOtp,
  resendRegistrationOtp,
} from '../services/otpService';
import { sendRegistrationOtpEmail } from '../services/emailService';

const publicUser = (user: { id: string; email: string; name: string; phone: string | null; createdAt: Date }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  phone: user.phone,
  createdAt: user.createdAt.toISOString(),
});

export const register = async (req: Request, res: Response): Promise<void> => {
  const name = requireString(req.body, 'name', { max: 100 });
  const email = requireEmail(req.body);
  const password = requireString(req.body, 'password', { min: 8, max: 128 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.password !== 'GUEST_NO_PASSWORD') {
    throw new HttpError(409, 'An account with this email already exists');
  }

  // Create pending registration and generate OTP
  const { otp, expiresAt } = await createPendingRegistration({ name, email, password });

  // Deliver verification code via email
  const emailRes = await sendRegistrationOtpEmail({ email, name, otp });
  if (!emailRes.success) {
    throw new HttpError(500, emailRes.error || 'Failed to send verification email. Please check your email and try again.');
  }

  res.status(200).json({
    success: true,
    requireOtp: true,
    email,
    message: 'Verification code sent to your email. Please enter the 6-digit code to complete registration.',
    expiresAt: expiresAt.toISOString(),
  });
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
  const email = requireEmail(req.body);
  const otp = requireString(req.body, 'otp', { min: 6, max: 10 });

  // Validates OTP against hashed store with attempt limits and expiry
  const verifiedData = await verifyRegistrationOtp(email, otp);

  // Check if claiming an existing guest user account
  const existing = await prisma.user.findUnique({ where: { email: verifiedData.email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: verifiedData.name,
        password: verifiedData.passwordHash,
      },
    });
  } else {
    await prisma.user.create({
      data: {
        email: verifiedData.email,
        name: verifiedData.name,
        password: verifiedData.passwordHash,
      },
    });
  }

  // Successfully verified - do NOT return auth session/token; redirect to login
  res.status(200).json({
    success: true,
    message: 'Account verified successfully. Please log in.',
  });
};

export const resendOtp = async (req: Request, res: Response): Promise<void> => {
  const email = requireEmail(req.body);

  const { otp, expiresAt } = await resendRegistrationOtp(email);

  const emailRes = await sendRegistrationOtpEmail({ email, name: 'Shopper', otp });
  if (!emailRes.success) {
    throw new HttpError(500, emailRes.error || 'Failed to resend verification email.');
  }

  res.status(200).json({
    success: true,
    message: 'A new verification code has been sent to your email.',
    expiresAt: expiresAt.toISOString(),
  });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const email = requireEmail(req.body);
  const password = requireString(req.body, 'password');

  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password, so accounts cannot be enumerated.
  // Also reject guest placeholder accounts that have no password set yet.
  if (!user || user.password === 'GUEST_NO_PASSWORD' || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  res.json({ token: signToken(user), user: publicUser(user) });
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: currentUserId(req) } });
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: publicUser(user) });
};

export const googleAuth = async (req: Request, res: Response): Promise<void> => {
  const result = await authenticateWithGoogle(req.body);
  res.json(result);
};

/** JWTs are stateless; the client discards its token. Kept so the frontend has a stable endpoint. */
export const logout = (_req: Request, res: Response): void => {
  res.status(204).end();
};

export { publicUser };
