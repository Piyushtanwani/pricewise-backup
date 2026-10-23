import prisma from '../utils/prisma';
import { env } from '../config/env';
import { readPrefs } from './notificationPrefs';
import { sendPriceDropAlertEmail, isValidHttpUrl } from './emailService';
import { NotificationJobStatus } from '../generated/prisma';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export interface MonitorCycleSummary {
  checked: number;
  eligible: number;
  queued: number;
  sent: number;
  failed: number;
  skippedDuplicates: number;
  rearmed: number;
}

export interface AlertWithRelations {
  id: string;
  userId: string;
  productId: string;
  targetPrice: number;
  notifyEmail: boolean;
  notifyInApp: boolean;
  notifyPush: boolean;
  isActive: boolean;
  triggeredAt: Date | null;
  lastCheckedPrice: number | null;
  lastNotifiedPrice: number | null;
  product: {
    id: string;
    name: string;
    brand: string;
    imageUrl: string | null;
    mrp: number | null;
    bestPrice: number | null;
    bestStoreId: string | null;
    bestStore?: { id: string; name: string } | null;
    stores: Array<{
      id: string;
      currentPrice: number;
      productUrl: string;
      stockStatus: string;
      store?: { id: string; name: string } | null;
    }>;
  };
  user: {
    id: string;
    email: string;
    name: string | null;
    notificationPrefs: unknown;
  };
}

/**
 * Resolves the latest genuine price and best store listing for a product.
 * Compares Product.bestPrice with active store listings to ensure manual database
 * updates to either Product or ProductStore are immediately reflected.
 */
export const resolveProductCurrentPrice = (product: AlertWithRelations['product']): {
  currentPrice: number | null;
  bestListing: AlertWithRelations['product']['stores'][0] | null;
  bestStoreName: string;
} => {
  const inStockListings = product.stores.filter((s) => s.stockStatus !== 'OUT_OF_STOCK');
  const availableListings = inStockListings.length > 0 ? inStockListings : product.stores;

  let lowestListing: AlertWithRelations['product']['stores'][0] | null = null;
  for (const listing of availableListings) {
    if (listing.currentPrice > 0) {
      if (!lowestListing || listing.currentPrice < lowestListing.currentPrice) {
        lowestListing = listing;
      }
    }
  }

  const listingPrice = lowestListing ? lowestListing.currentPrice : null;
  const bestPrice = product.bestPrice && product.bestPrice > 0 ? product.bestPrice : null;

  // If ProductStore has a lower price, or if bestPrice is null, use listingPrice
  let currentPrice: number | null = null;
  if (bestPrice !== null && listingPrice !== null) {
    currentPrice = Math.min(bestPrice, listingPrice);
  } else {
    currentPrice = bestPrice ?? listingPrice;
  }

  const matchingListing =
    availableListings.find((s) => s.currentPrice === currentPrice) ||
    lowestListing ||
    product.stores[0] ||
    null;

  const bestStoreName =
    product.bestStore?.name ||
    matchingListing?.store?.name ||
    'Verified Store';

  return { currentPrice, bestListing: matchingListing, bestStoreName };
};

/**
 * Determines whether an alert is eligible for notification based on its current price,
 * target price, and previous notification state.
 */
export const evaluateAlertEligibility = (
  alert: AlertWithRelations,
  currentPrice: number,
  previousPrice: number | null,
): {
  isEligible: boolean;
  isDuplicate: boolean;
  shouldRearm: boolean;
  savings: number;
  savingsPercent: number | null;
  reason: string;
} => {
  // If price is above the user's target price
  if (currentPrice > alert.targetPrice) {
    const shouldRearm = alert.triggeredAt !== null || alert.lastNotifiedPrice !== null;
    return {
      isEligible: false,
      isDuplicate: false,
      shouldRearm,
      savings: 0,
      savingsPercent: null,
      reason: `Current price (${currentPrice}) is above target (${alert.targetPrice})`,
    };
  }

  // Target price is met (currentPrice <= alert.targetPrice)
  // Check duplicate prevention:
  // 1. If we already notified the user for this exact price, skip!
  if (alert.lastNotifiedPrice !== null && alert.lastNotifiedPrice === currentPrice) {
    return {
      isEligible: false,
      isDuplicate: true,
      shouldRearm: false,
      savings: 0,
      savingsPercent: null,
      reason: `Already notified for this exact price (${currentPrice})`,
    };
  }

  // 2. If already notified at a lower price, and price rose slightly but still <= targetPrice,
  // do not re-send an alert for a higher price than the one already notified.
  if (alert.lastNotifiedPrice !== null && currentPrice > alert.lastNotifiedPrice) {
    return {
      isEligible: false,
      isDuplicate: true,
      shouldRearm: false,
      savings: 0,
      savingsPercent: null,
      reason: `Current price (${currentPrice}) is higher than last notified price (${alert.lastNotifiedPrice})`,
    };
  }

  // Savings calculation against previous price or MRP
  let savings = 0;
  let savingsPercent: number | null = null;
  if (previousPrice !== null && previousPrice > currentPrice) {
    savings = previousPrice - currentPrice;
    savingsPercent = Math.round((savings / previousPrice) * 100);
  }

  return {
    isEligible: true,
    isDuplicate: false,
    shouldRearm: false,
    savings,
    savingsPercent,
    reason: `Target reached! Current price (${currentPrice}) <= Target (${alert.targetPrice})`,
  };
};

/**
 * Main monitoring cycle function.
 * Evaluates all active alerts in the database, queues jobs for newly eligible alerts,
 * and atomically claims and processes pending/retryable notification jobs.
 */
export const checkActivePriceAlerts = async (options?: {
  workerId?: string;
  skipProcessing?: boolean;
}): Promise<MonitorCycleSummary> => {
  const workerId = options?.workerId || `worker-${process.pid}-${Date.now()}`;
  const summary: MonitorCycleSummary = {
    checked: 0,
    eligible: 0,
    queued: 0,
    sent: 0,
    failed: 0,
    skippedDuplicates: 0,
    rearmed: 0,
  };

  console.log('[PRICE ALERT MONITOR] Checking active alerts');

  // 1. Query all active price alerts with their products, stores, and user info
  const alerts = await prisma.alert.findMany({
    where: { isActive: true },
    include: {
      product: {
        include: {
          bestStore: true,
          stores: {
            include: { store: true },
            orderBy: { currentPrice: 'asc' },
          },
        },
      },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          notificationPrefs: true,
        },
      },
    },
  });

  summary.checked = alerts.length;
  console.log(`[PRICE ALERT MONITOR] Active alerts found: ${alerts.length}`);

  if (alerts.length === 0) {
    console.log('[PRICE ALERT MONITOR] Monitoring cycle completed');
    return summary;
  }

  // 2. Evaluate each alert
  for (const alert of alerts as unknown as AlertWithRelations[]) {
    const { currentPrice, bestListing, bestStoreName } = resolveProductCurrentPrice(alert.product);

    if (currentPrice === null || currentPrice <= 0) {
      continue;
    }

    // Determine previous price:
    // Priority: alert.lastCheckedPrice > recent price from PriceHistory > product.mrp > currentPrice
    let previousPrice: number | null = null;
    if (alert.lastCheckedPrice !== null && alert.lastCheckedPrice !== currentPrice) {
      previousPrice = alert.lastCheckedPrice;
    } else {
      const history = await prisma.priceHistory.findFirst({
        where: {
          productStore: { productId: alert.productId },
          price: { gt: currentPrice },
        },
        orderBy: { timestamp: 'desc' },
      });
      previousPrice = history?.price || (alert.product.mrp && alert.product.mrp > currentPrice ? alert.product.mrp : null);
    }

    const evalResult = evaluateAlertEligibility(alert, currentPrice, previousPrice);

    // Handle alert re-arming when price rises above target
    if (evalResult.shouldRearm) {
      await prisma.alert.update({
        where: { id: alert.id },
        data: {
          triggeredAt: null,
          lastNotifiedPrice: null,
          lastCheckedPrice: currentPrice,
        },
      });
      summary.rearmed++;
      console.log(
        `[PRICE ALERT MONITOR] Alert ${alert.id} re-armed: price (${currentPrice}) rose above target (${alert.targetPrice})`,
      );
      continue;
    }

    if (evalResult.isDuplicate) {
      summary.skippedDuplicates++;
      console.log(`[PRICE ALERT MONITOR] Duplicate notification skipped: ${evalResult.reason}`);
      // Keep lastCheckedPrice updated
      if (alert.lastCheckedPrice !== currentPrice) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: { lastCheckedPrice: currentPrice },
        });
      }
      continue;
    }

    if (!evalResult.isEligible) {
      // Not eligible (e.g. price still above target)
      if (alert.lastCheckedPrice !== currentPrice) {
        await prisma.alert.update({
          where: { id: alert.id },
          data: { lastCheckedPrice: currentPrice },
        });
      }
      continue;
    }

    // Eligible!
    summary.eligible++;

    // 3. Persistently queue notification job with unique constraint (alertId, triggerPrice)
    try {
      await prisma.notificationJob.upsert({
        where: {
          alertId_triggerPrice: {
            alertId: alert.id,
            triggerPrice: currentPrice,
          },
        },
        create: {
          alertId: alert.id,
          userId: alert.userId,
          productId: alert.productId,
          triggerPrice: currentPrice,
          previousPrice: previousPrice && previousPrice > currentPrice ? previousPrice : null,
          targetPrice: alert.targetPrice,
          status: NotificationJobStatus.PENDING,
        },
        update: {}, // do not overwrite existing state
      });
      summary.queued++;
      console.log(`[PRICE ALERT MONITOR] Notification queued for alert ${alert.id} at ${currentPrice}`);
    } catch (err) {
      // If concurrent insert occurred, unique constraint handles it safely
      console.warn(`[PRICE ALERT MONITOR] Notice: Job queue upsert handled by constraint:`, err);
    }
  }

  // 4. Process pending and retryable notification jobs
  if (!options?.skipProcessing) {
    const jobResult = await processNotificationJobs({ workerId });
    summary.sent = jobResult.sent;
    summary.failed = jobResult.failed;
  }

  console.log(
    `[PRICE ALERT MONITOR] Monitoring cycle completed: ${summary.checked} checked, ${summary.eligible} eligible, ${summary.sent} sent, ${summary.skippedDuplicates} duplicates skipped`,
  );

  return summary;
};

/**
 * Atomically claims and processes eligible notification jobs (PENDING or FAILED with attempts < maxAttempts).
 * Uses atomic UPDATE with lock fields so multiple workers cannot claim the same notification simultaneously.
 */
export const processNotificationJobs = async (options?: {
  workerId?: string;
  maxJobs?: number;
  jobIds?: string[];
}): Promise<{ processed: number; sent: number; failed: number }> => {
  const workerId = options?.workerId || `worker-${process.pid}-${Date.now()}`;
  const maxJobs = options?.maxJobs || 50;
  const result = { processed: 0, sent: 0, failed: 0 };

  const now = new Date();
  const retryWindowMs = 60 * 1000; // 60s minimum backoff between retries

  // Find candidate jobs ready for processing
  const candidates = await prisma.notificationJob.findMany({
    where: {
      ...(options?.jobIds ? { id: { in: options.jobIds } } : {}),
      OR: [
        { status: NotificationJobStatus.PENDING },
        {
          status: NotificationJobStatus.FAILED,
          attempts: { lt: 3 },
          updatedAt: { lte: new Date(now.getTime() - retryWindowMs) },
        },
      ],
    },
    include: {
      alert: {
        include: {
          product: {
            include: {
              bestStore: true,
              stores: { include: { store: true }, orderBy: { currentPrice: 'asc' } },
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              notificationPrefs: true,
            },
          },
        },
      },
    },
    take: maxJobs,
    orderBy: { createdAt: 'asc' },
  });

  for (const job of candidates) {
    // Atomic claiming: update status to PROCESSING only if still PENDING or FAILED
    const claim = await prisma.notificationJob.updateMany({
      where: {
        id: job.id,
        status: { in: [NotificationJobStatus.PENDING, NotificationJobStatus.FAILED] },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } }, // 5 min stale lock takeover
        ],
      },
      data: {
        status: NotificationJobStatus.PROCESSING,
        lockedAt: now,
        lockedBy: workerId,
        attempts: { increment: 1 },
      },
    });

    if (claim.count === 0) {
      // Job claimed by another worker simultaneously — skip!
      continue;
    }

    result.processed++;

    const alert = job.alert as unknown as AlertWithRelations;
    const user = alert.user;
    const product = alert.product;
    const prefs = readPrefs(user.notificationPrefs);

    const { bestListing, bestStoreName } = resolveProductCurrentPrice(product);
    const appBaseUrl = (env.corsOrigins[0] || 'http://localhost:5173').replace(/\/+$/, '');
    const canonicalProductUrl = `${appBaseUrl}/product/${product.id}`;
    const directProductUrl =
      bestListing?.productUrl && isValidHttpUrl(bestListing.productUrl)
        ? bestListing.productUrl
        : canonicalProductUrl;

    let emailSuccess = true;
    let errorMessage: string | null = null;

    // Send email alert if enabled on alert and user preferences
    if (alert.notifyEmail && user?.email && prefs.targetEmail) {
      const emailParams = {
        email: user.email,
        userName: user.name || undefined,
        productName: product.name,
        brand: product.brand,
        previousPrice: job.previousPrice,
        currentPrice: job.triggerPrice,
        targetPrice: job.targetPrice,
        dropAmount: job.previousPrice && job.previousPrice > job.triggerPrice ? job.previousPrice - job.triggerPrice : undefined,
        bestStore: bestStoreName,
        productUrl: directProductUrl,
        imageUrl: product.imageUrl || undefined,
      };

      try {
        const sendResult = await sendPriceDropAlertEmail(emailParams);
        if (!sendResult.success) {
          emailSuccess = false;
          errorMessage = sendResult.error || 'Email dispatch failed';
        }
      } catch (err: any) {
        emailSuccess = false;
        errorMessage = err?.message || String(err);
      }
    }

    if (emailSuccess) {
      // Send In-App notification if enabled
      if (alert.notifyInApp && prefs.targetInApp) {
        try {
          await prisma.notification.create({
            data: {
              userId: alert.userId,
              productId: alert.productId,
              type: 'TARGET_REACHED',
              title: 'Target price reached!',
              body: `${product.name} is now at ${inr(job.triggerPrice)} at ${bestStoreName} — your target was ${inr(alert.targetPrice)}`,
              prevPrice: job.previousPrice,
              newPrice: job.triggerPrice,
              targetPrice: alert.targetPrice,
            },
          });
        } catch (inAppErr) {
          console.warn('[PRICE ALERT MONITOR] In-app notification creation warning:', inAppErr);
        }
      }

      // Mark job as SENT
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          status: NotificationJobStatus.SENT,
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });

      // Update Alert state to record delivery and prevent duplicate emails
      await prisma.alert.update({
        where: { id: alert.id },
        data: {
          triggeredAt: new Date(),
          lastNotifiedPrice: job.triggerPrice,
          lastCheckedPrice: job.triggerPrice,
        },
      });

      result.sent++;
      console.log(`[PRICE ALERT MONITOR] Email sent successfully to ${user.email} for ${product.name}`);
    } else {
      // Mark job as FAILED (will be retried on subsequent cycles if attempts < maxAttempts)
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          status: NotificationJobStatus.FAILED,
          lastError: errorMessage,
          lockedAt: null,
          lockedBy: null,
        },
      });

      result.failed++;
      console.warn(`[PRICE ALERT MONITOR] Notification job ${job.id} failed: ${errorMessage}`);
    }
  }

  return result;
};
