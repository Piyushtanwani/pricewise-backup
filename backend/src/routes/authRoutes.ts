import { Router } from 'express';
import { register, login, me, logout } from '../controllers/authController';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticateToken, me);
router.post('/logout', authenticateToken, logout);

export default router;
