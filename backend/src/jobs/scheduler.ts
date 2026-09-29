import { env } from '../config/env';
import { configuredProviders } from '../services/stores';
import { syncPrices } from '../services/priceSync';

/**
 * In-process interval sync. Suitable for a single backend instance; move to BullMQ/Redis
 * (as planned in LLM_Docs) before running more than one instance.
 */
export const startPriceSyncScheduler = (): NodeJS.Timeout | null => {
  const minutes = env.priceSyncIntervalMinutes;
  if (minutes <= 0) return null;
  if (configuredProviders().length === 0) {
    console.log('Price sync scheduler not started: no store API credentials configured.');
    return null;
  }

  const run = async () => {
    try {
      const summary = await syncPrices();
      console.log(
        `Price sync finished: ${summary.productsUpdated} products updated, ${summary.notificationsCreated} notifications created`,
      );
    } catch (err) {
      console.error('Price sync failed:', err);
    }
  };

  console.log(`Price sync scheduler running every ${minutes} minute(s).`);
  const timer = setInterval(run, minutes * 60 * 1000);
  timer.unref();
  return timer;
};
