import { env } from '../config/env';
import prisma from '../utils/prisma';
import { readPrefs } from './notificationPrefs';
import { sendPriceDropAlertEmail, isValidHttpUrl } from './emailService';
import { isPriceFresh, isSyntheticProduct } from './dataProvenance';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export interface EvaluatePriceChangeOptions {
  maxAgeHours?: number;
}

/**
 * Creates in-app notifications and sends Nodemailer Gmail emails after a product's best price changes:
 *  - TARGET_REACHED for active alerts whose target is now met
 *  - PRICE_DROP for watchers and wishlisters when the drop exceeds PRICE_DROP_THRESHOLD_PERCENT
 *
 * Verifies data provenance and price freshness: synthetic seed data and stale prices are strictly excluded.
 */
export const evaluatePriceChange = async (
  productId: string,
  previousBest: number | null,
  newBest: number,
  options?: EvaluatePriceChangeOptions,
): Promise<number> => {
  if (!productId || typeof productId !== 'string') return 0;
  if (!Number.isFinite(newBest) || newBest <= 0) return 0;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      bestStore: true,
      stores: {
        include: { store: true },
        orderBy: { currentPrice: 'asc' },
      },
    },
  });

  if (!product) return 0;

  // Provenance check: Never send alerts for synthetic seed fixtures or demo data
  if (isSyntheticProduct(product)) {
    console.info(`[AlertEngine] Skipped alert evaluation for synthetic/seed product ${productId} (${product.name})`);
    return 0;
  }

  // Price freshness check: Ensure at least one active listing has a recent, valid price
  const inStockListings = product.stores.filter((s) => s.stockStatus !== 'OUT_OF_STOCK');
  const bestListing =
    inStockListings.find((s) => s.currentPrice === newBest) ||
    inStockListings[0] ||
    product.stores[0];

  if (!bestListing || !isPriceFresh(bestListing.lastCheckedAt, options?.maxAgeHours)) {
    console.warn(`[AlertEngine] Skipped alert for ${productId}: price observation is missing, stale, or unverified.`);
    return 0;
  }

  const bestStoreName = product.bestStore?.name || bestListing.store?.name;
  if (!bestStoreName || bestStoreName.trim() === 'Retail Store') {
    console.warn(`[AlertEngine] Skipped alert for ${productId}: missing verified retailer name.`);
    return 0;
  }

  const appBaseUrl = (env.corsOrigins[0] || 'http://localhost:5173').replace(/\/+$/, '');
  const canonicalProductUrl = `${appBaseUrl}/product/${product.id}`;
  const directProductUrl =
    bestListing.productUrl && isValidHttpUrl(bestListing.productUrl)
      ? bestListing.productUrl
      : canonicalProductUrl;

  // Real price drop check: Did the price actually decrease between verified observations?
  const isGenuinePriceReduction =
    previousBest !== null &&
    Number.isFinite(previousBest) &&
    newBest < previousBest;

  let created = 0;
  const alreadyNotified = new Set<string>();

  const alerts = await prisma.alert.findMany({
    where: { productId, isActive: true },
    include: { user: { select: { email: true, name: true, notificationPrefs: true } } },
  });

  for (const alert of alerts) {
    if (newBest <= alert.targetPrice) {
      // Prevent duplicate notifications if already triggered for this price level
      if (alert.triggeredAt) {
        alreadyNotified.add(alert.userId);
        continue;
      }

      // Suppress alert triggering when no genuine price reduction occurred
      if (!isGenuinePriceReduction) {
        continue;
      }

      await prisma.alert.update({ where: { id: alert.id }, data: { triggeredAt: new Date() } });

      const prefs = readPrefs(alert.user.notificationPrefs);

      if (alert.notifyInApp && prefs.targetInApp) {
        await prisma.notification.create({
          data: {
            userId: alert.userId,
            productId,
            type: 'TARGET_REACHED',
            title: 'Target price reached!',
            body: `${product.name} is now at ${inr(newBest)} at ${bestStoreName} — your target was ${inr(alert.targetPrice)}`,
            prevPrice: previousBest,
            newPrice: newBest,
            targetPrice: alert.targetPrice,
          },
        });
        created++;
      }

      // Send email alert only if a genuine price reduction occurred and user enabled target email
      if (alert.notifyEmail && alert.user?.email && prefs.targetEmail) {
        if (isGenuinePriceReduction) {
          sendPriceDropAlertEmail({
            email: alert.user.email,
            userName: alert.user.name || undefined,
            productName: product.name,
            brand: product.brand,
            previousPrice: previousBest,
            currentPrice: newBest,
            targetPrice: alert.targetPrice,
            dropAmount: previousBest - newBest,
            bestStore: bestStoreName,
            productUrl: directProductUrl,
            imageUrl: product.imageUrl || undefined,
          }).catch((err) => console.error('[AlertEngine Email Error]:', err));
        } else {
          console.info(
            `[AlertEngine] Target reached for alert ${alert.id}, but no prior price drop observed (prev: ${previousBest}, new: ${newBest}). Suppressing price-drop email.`,
          );
        }
      }

      alreadyNotified.add(alert.userId);
    } else if (newBest > alert.targetPrice && alert.triggeredAt) {
      // Re-arm so the user is alerted again the next time the target is reached
      await prisma.alert.update({ where: { id: alert.id }, data: { triggeredAt: null } });
    }
  }

  // General price drop notifications for watchers / wishlisters
  const threshold = env.priceDropThresholdPercent / 100;
  if (isGenuinePriceReduction && newBest < previousBest * (1 - threshold)) {
    const [watchers, wishers] = await Promise.all([
      prisma.watchlist.findMany({ where: { productId }, select: { userId: true, user: { select: { notificationPrefs: true } } } }),
      prisma.wishlist.findMany({ where: { productId }, select: { userId: true, user: { select: { notificationPrefs: true } } } }),
    ]);

    const recipients = new Map<string, unknown>();
    for (const row of [...watchers, ...wishers]) recipients.set(row.userId, row.user.notificationPrefs);

    const data = [...recipients.entries()]
      .filter(([userId, prefs]) => !alreadyNotified.has(userId) && readPrefs(prefs).priceDropInApp)
      .map(([userId]) => ({
        userId,
        productId,
        type: 'PRICE_DROP' as const,
        title: 'Price dropped!',
        body: `${product.name} dropped by ${inr(previousBest - newBest)} at ${bestStoreName} — now ${inr(newBest)}`,
        prevPrice: previousBest,
        newPrice: newBest,
      }));

    if (data.length) {
      await prisma.notification.createMany({ data });
      created += data.length;
    }
  }

  return created;
};
