import { Router } from 'express';
import { register, verifyOtp, resendOtp, login, me, logout, googleAuth } from '../controllers/authController';
import { authenticateToken } from '../middlewares/auth';
import { authRateLimiter } from '../middlewares/security';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/verify-otp', authRateLimiter, verifyOtp);
router.post('/resend-otp', authRateLimiter, resendOtp);
router.post('/login', authRateLimiter, login);
router.post('/google', authRateLimiter, googleAuth);
router.get('/me', authenticateToken, me);
router.post('/logout', authenticateToken, logout);

export default router;
