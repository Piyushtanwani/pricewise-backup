import { env } from './config/env';
import { createApp } from './app';
import { startPriceSyncScheduler } from './jobs/scheduler';
import { providerStatus } from './services/stores';
import prisma from './utils/prisma';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`Server is running on port ${env.port}`);
  for (const p of providerStatus()) {
    console.log(`  ${p.store} API: ${p.configured ? 'configured' : `not configured (missing ${p.missing.join(', ')})`}`);
  }
  startPriceSyncScheduler();
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
