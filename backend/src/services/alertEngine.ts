import { env } from '../config/env';
import prisma from '../utils/prisma';
import { readPrefs } from './notificationPrefs';
import { sendPriceDropAlertEmail } from './emailService';

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/**
 * Creates in-app notifications and sends Nodemailer Gmail emails after a product's best price changes:
 *  - TARGET_REACHED for active alerts whose target is now met
 *  - PRICE_DROP for watchers and wishlisters when the drop exceeds PRICE_DROP_THRESHOLD_PERCENT
 */
export const evaluatePriceChange = async (
  productId: string,
  previousBest: number | null,
  newBest: number,
): Promise<number> => {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true, brand: true, imageUrl: true } });
  if (!product) return 0;

  let created = 0;
  const alreadyNotified = new Set<string>();

  const alerts = await prisma.alert.findMany({
    where: { productId, isActive: true },
    include: { user: { select: { email: true, name: true, notificationPrefs: true } } },
  });

  for (const alert of alerts) {
    if (newBest <= alert.targetPrice && !alert.triggeredAt) {
      await prisma.alert.update({ where: { id: alert.id }, data: { triggeredAt: new Date() } });
      if (alert.notifyInApp && readPrefs(alert.user.notificationPrefs).targetInApp) {
        await prisma.notification.create({
          data: {
            userId: alert.userId,
            productId,
            type: 'TARGET_REACHED',
            title: 'Target price reached!',
            body: `${product.name} is now at ${inr(newBest)} — your target was ${inr(alert.targetPrice)}`,
            prevPrice: previousBest,
            newPrice: newBest,
            targetPrice: alert.targetPrice,
          },
        });
        created++;
      }
      if (alert.notifyEmail && alert.user?.email) {
        sendPriceDropAlertEmail({
          email: alert.user.email,
          userName: alert.user.name || undefined,
          productName: product.name,
          brand: product.brand,
          previousPrice: previousBest,
          currentPrice: newBest,
          targetPrice: alert.targetPrice,
          imageUrl: product.imageUrl || undefined,
        }).catch((err) => console.error('[AlertEngine Email Error]:', err));
      }
      alreadyNotified.add(alert.userId);
    } else if (newBest > alert.targetPrice && alert.triggeredAt) {
      // Re-arm so the user is told again the next time the target is reached.
      await prisma.alert.update({ where: { id: alert.id }, data: { triggeredAt: null } });
    }
  }

  const threshold = env.priceDropThresholdPercent / 100;
  if (previousBest !== null && newBest < previousBest * (1 - threshold)) {
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
        body: `${product.name} dropped by ${inr(previousBest - newBest)} — now ${inr(newBest)}`,
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
