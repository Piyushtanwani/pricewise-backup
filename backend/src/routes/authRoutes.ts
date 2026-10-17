import { Router } from 'express';
import { register, login, me, logout, googleAuth } from '../controllers/authController';
import { authenticateToken } from '../middlewares/auth';
import { authRateLimiter } from '../middlewares/security';

const router = Router();

router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/google', authRateLimiter, googleAuth);
router.get('/me', authenticateToken, me);
router.post('/logout', authenticateToken, logout);

export default router;
