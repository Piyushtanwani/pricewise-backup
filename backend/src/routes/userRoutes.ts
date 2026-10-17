import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  deleteAccount,
  changePassword,
  getNotificationSettings,
  updateNotificationSettings,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getAlerts,
  addAlert,
  updateAlert,
  removeAlert,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getRecommendations,
  setPriceNotification,
  testPriceAlertEmail,
} from '../controllers/userController';
import { authenticateToken, optionalAuth } from '../middlewares/auth';
import { emailAlertRateLimiter } from '../middlewares/security';

const router = Router();

// Public / Guest & Authenticated Price Alerts via Nodemailer Email
router.post('/alerts/notify', optionalAuth, emailAlertRateLimiter, setPriceNotification);
router.post('/alerts/test-email', optionalAuth, emailAlertRateLimiter, testPriceAlertEmail);

router.use(authenticateToken); // Protect rest of user routes

// Profile & settings
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.put('/profile', updateProfile);
router.delete('/profile', deleteAccount);
router.put('/password', changePassword);
router.get('/settings/notifications', getNotificationSettings);
router.put('/settings/notifications', updateNotificationSettings);

// Wishlist
router.get('/wishlist', getWishlist);
router.post('/wishlist', addToWishlist);
router.delete('/wishlist/:productId', removeFromWishlist);

// Watchlist (tracked products)
router.get('/watchlist', getWatchlist);
router.post('/watchlist', addToWatchlist);
router.delete('/watchlist/:productId', removeFromWatchlist);

// Alerts
router.get('/alerts', getAlerts);
router.post('/alerts', addAlert);
router.patch('/alerts/:alertId', updateAlert);
router.delete('/alerts/:alertId', removeAlert);

// Notifications
router.get('/notifications', getNotifications);
router.post('/notifications/read-all', markAllNotificationsRead);
router.patch('/notifications/:notificationId/read', markNotificationRead);

// Recommendations
router.get('/recommendations', getRecommendations);

export default router;
