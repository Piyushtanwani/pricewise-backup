import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import userRoutes from './routes/userRoutes';
import intelligenceRoutes from './routes/intelligenceRoutes';
import { adminRouter, integrationRouter } from './routes/integrationRoutes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  // Basic health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'PriceWise Core Backend is running' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/user', userRoutes);
  app.use('/api/intelligence', intelligenceRoutes);
  app.use('/api/integrations', integrationRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
