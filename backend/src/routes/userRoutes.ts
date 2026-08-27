import { Router } from 'express';
import { getWatchlist, addToWatchlist, removeFromWatchlist, getAlerts, addAlert, removeAlert } from '../controllers/userController';
import { authenticateToken } from '../middlewares/auth';

const router = Router();

router.use(authenticateToken as any); // Protect all user routes

// Watchlist
router.get('/watchlist', getWatchlist as any);
router.post('/watchlist', addToWatchlist as any);
router.delete('/watchlist/:productId', removeFromWatchlist as any);

// Alerts
router.get('/alerts', getAlerts as any);
router.post('/alerts', addAlert as any);
router.delete('/alerts/:alertId', removeAlert as any);

export default router;
