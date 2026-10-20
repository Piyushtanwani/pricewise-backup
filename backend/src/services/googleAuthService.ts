import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { env } from '../config/env';
import { HttpError } from '../utils/http';
import { signToken } from '../middlewares/auth';
import { publicUser } from '../controllers/authController';

export interface GoogleAuthPayload {
  credential?: string; // Google ID Token (from Google Identity Services)
  code?: string;       // Authorization Code (from OAuth 2.0 flow)
  redirectUri?: string;
  accessToken?: string;
}

export interface GoogleUserInfo {
  email: string;
  name: string;
  picture?: string;
  googleId: string;
}

/**
 * Verifies a Google ID Token using Google's public tokeninfo API
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) {
    const errText = await res.text();
    throw new HttpError(401, `Invalid Google ID token: ${errText}`);
  }

  const payload: any = await res.json();
  if (!payload.email) {
    throw new HttpError(401, 'Google account has no associated email address.');
  }

  // Verify audience if client ID is configured
  if (env.google.clientId && payload.aud && payload.aud !== env.google.clientId && payload.azp !== env.google.clientId) {
    console.warn(`[GoogleAuth] Token aud (${payload.aud}) does not match configured clientId (${env.google.clientId})`);
  }

  return {
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture,
    googleId: payload.sub,
  };
}

/**
 * Exchanges an authorization code for Google user details
 */
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleUserInfo> {
  if (!env.google.clientId || !env.google.clientSecret) {
    throw new HttpError(500, 'Google OAuth credentials (Client_ID and Client_secret) are not configured on the server.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new HttpError(401, `Failed to exchange Google authorization code: ${err}`);
  }

  const tokenData: any = await tokenRes.json();
  if (tokenData.id_token) {
    return verifyGoogleIdToken(tokenData.id_token);
  }

  // Fallback to userinfo endpoint using access_token
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userInfoRes.ok) {
    throw new HttpError(401, 'Failed to fetch user profile from Google.');
  }

  const userPayload: any = await userInfoRes.json();
  return {
    email: userPayload.email.toLowerCase(),
    name: userPayload.name || userPayload.email.split('@')[0],
    picture: userPayload.picture,
    googleId: userPayload.sub,
  };
}

/**
 * Authenticates or auto-provisions a user account via Google OAuth
 */
export async function authenticateWithGoogle(payload: GoogleAuthPayload) {
  let googleUser: GoogleUserInfo;

  if (payload.credential) {
    googleUser = await verifyGoogleIdToken(payload.credential);
  } else if (payload.code) {
    const redirectUri = payload.redirectUri || 'http://localhost:5173/auth/callback';
    googleUser = await exchangeGoogleCode(payload.code, redirectUri);
  } else if (payload.accessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${payload.accessToken}` },
    });
    if (!res.ok) throw new HttpError(401, 'Invalid Google access token.');
    const data: any = await res.json();
    googleUser = {
      email: data.email.toLowerCase(),
      name: data.name || data.email.split('@')[0],
      picture: data.picture,
      googleId: data.sub,
    };
  } else {
    throw new HttpError(400, 'Missing Google credential or authorization code.');
  }

  // Find or create user in database
  let user = await prisma.user.findUnique({
    where: { email: googleUser.email },
  });

  if (!user) {
    // Generate secure random placeholder hash for OAuth user
    const dummyPassword = await bcrypt.hash(`GOOGLE_SSO_${Date.now()}_${Math.random()}`, 10);
    user = await prisma.user.create({
      data: {
        email: googleUser.email,
        name: googleUser.name,
        password: dummyPassword,
      },
    });
  } else if (user.password === 'GUEST_NO_PASSWORD') {
    // Claim guest placeholder account
    const dummyPassword = await bcrypt.hash(`GOOGLE_SSO_${Date.now()}_${Math.random()}`, 10);
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: googleUser.name || user.name,
        password: dummyPassword,
      },
    });
  }

  const token = signToken(user);
  return {
    token,
    user: publicUser(user),
  };
}
