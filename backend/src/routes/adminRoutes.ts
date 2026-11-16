import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth';
import {
  getAdminReports,
  getAdminProducts,
  getAdminProductById,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  getAdminUsers,
  updateAdminUserRole,
  toggleAdminUserBan,
  deleteAdminUser,
  getAdminNotificationQueue,
  retryAdminNotificationJob,
  triggerAdminMonitorCycle,
} from '../controllers/adminController';

const router = Router();

// Protect all admin endpoints with JWT authentication and Admin role check
router.use(authenticateToken);
router.use(requireAdmin);

// Reports & Overview
router.get('/reports', getAdminReports);
router.post('/monitor/trigger', triggerAdminMonitorCycle);

// Product Management (CRUD)
router.get('/products', getAdminProducts);
router.get('/products/:id', getAdminProductById);
router.post('/products', createAdminProduct);
router.put('/products/:id', updateAdminProduct);
router.patch('/products/:id', updateAdminProduct);
router.delete('/products/:id', deleteAdminProduct);

// User Management
router.get('/users', getAdminUsers);
router.patch('/users/:id/role', updateAdminUserRole);
router.patch('/users/:id/ban', toggleAdminUserBan);
router.delete('/users/:id', deleteAdminUser);

// Notification Jobs Queue
router.get('/notifications/queue', getAdminNotificationQueue);
router.post('/notifications/queue/:id/retry', retryAdminNotificationJob);

export default router;

