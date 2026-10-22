import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import userRoutes from './routes/userRoutes';
import intelligenceRoutes from './routes/intelligenceRoutes';
import { adminRouter, integrationRouter } from './routes/integrationRoutes';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { securityHeaders } from './middlewares/security';

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);

  const isAllowedOrigin = (origin?: string): boolean => {
    if (!origin) return true;
    if (env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return true;
    if (origin.endsWith('.vercel.app')) return true;
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return true;
    return false;
  };

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked request from origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(express.json({ limit: '100kb' }));

  // Root and health check endpoints
  app.get('/', (_req, res) => {
    res.json({ status: 'ok', message: 'PriceWise Core Backend API is live' });
  });

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
