import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { HttpError } from '../utils/http';
import { requireEmail, requireString } from '../utils/validate';
import { currentUserId, signToken } from '../middlewares/auth';

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
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  const user = await prisma.user.create({
    data: { email, name, password: await bcrypt.hash(password, 10) },
  });

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const email = requireEmail(req.body);
  const password = requireString(req.body, 'password');

  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password, so accounts cannot be enumerated.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  res.json({ token: signToken(user), user: publicUser(user) });
};

export const me = async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: currentUserId(req) } });
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: publicUser(user) });
};

/** JWTs are stateless; the client discards its token. Kept so the frontend has a stable endpoint. */
export const logout = (_req: Request, res: Response): void => {
  res.status(204).end();
};

export { publicUser };
