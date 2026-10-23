import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { NotificationType } from '../generated/prisma';
import prisma from '../utils/prisma';
import { HttpError, badRequest, notFound } from '../utils/http';
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  queryInt,
  queryString,
  requireEmail,
  requirePositiveNumber,
  requireString,
} from '../utils/validate';
import { currentUserId } from '../middlewares/auth';
import { publicUser } from './authController';
import { PREF_KEYS, readPrefs } from '../services/notificationPrefs';
import { ProductCard, ProductWithStores, presentCards, productInclude } from '../services/productService';
import { sendPriceAlertConfirmationEmail, sendPriceDropAlertEmail, isValidHttpUrl } from '../services/emailService';
import { isSyntheticProduct } from '../services/dataProvenance';
import { env } from '../config/env';

const round = (n: number) => Math.round(n);

const requireProduct = async (productId: unknown) => {
  if (typeof productId !== 'string' || !productId) throw badRequest('productId is required');
  const product = await prisma.product.findUnique({ where: { id: productId }, include: productInclude });
  if (!product) throw notFound('Product not found');
  return product;
};

const cardsById = async (products: ProductWithStores[]): Promise<Map<string, ProductCard>> => {
  const unique = [...new Map(products.map((p) => [p.id, p])).values()];
  const cards = await presentCards(unique);
  return new Map(cards.map((c) => [c.id, c]));
};

// ---------------------------------------------------------------- Profile

const profileStats = async (userId: string) => {
  const [productsTracked, wishlist, alertsReceived, activeAlerts] = await Promise.all([
    prisma.watchlist.count({ where: { userId } }),
    prisma.wishlist.findMany({ where: { userId }, include: { product: { select: { bestPrice: true } } } }),
    prisma.notification.count({ where: { userId, type: { in: ['PRICE_DROP', 'TARGET_REACHED'] } } }),
    prisma.alert.count({ where: { userId, isActive: true } }),
  ]);
  const savingsDiscovered = wishlist.reduce(
    (sum, w) => sum + Math.max(0, w.addedPrice - (w.product.bestPrice ?? w.addedPrice)),
    0,
  );
  return { productsTracked, wishlistItems: wishlist.length, alertsReceived, activeAlerts, savingsDiscovered: round(savingsDiscovered) };
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: publicUser(user), stats: await profileStats(userId) });
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const name = optionalString(req.body, 'name', { max: 100 });
  const phone = req.body?.phone === null ? null : optionalString(req.body, 'phone', { max: 20 });
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) throw badRequest('phone must be a valid phone number');
  if (name === undefined && phone === undefined) throw badRequest('Provide name and/or phone to update');

  const user = await prisma.user.update({
    where: { id: currentUserId(req) },
    data: { ...(name !== undefined ? { name } : {}), ...(phone !== undefined ? { phone } : {}) },
  });
  res.json({ user: publicUser(user) });
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  const currentPassword = requireString(req.body, 'currentPassword');
  const newPassword = requireString(req.body, 'newPassword', { min: 8, max: 128 });
  const userId = currentUserId(req);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  await prisma.user.update({ where: { id: userId }, data: { password: await bcrypt.hash(newPassword, 10) } });
  res.status(204).end();
};

export const deleteAccount = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  await prisma.user.delete({ where: { id: userId } });
  res.status(204).end();
};

export const getNotificationSettings = async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: currentUserId(req) }, select: { notificationPrefs: true } });
  res.json(readPrefs(user?.notificationPrefs));
};

export const updateNotificationSettings = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
  const prefs = readPrefs(user?.notificationPrefs);

  const unknown = Object.keys(req.body ?? {}).filter((k) => !PREF_KEYS.includes(k as never));
  if (unknown.length) throw badRequest(`Unknown settings: ${unknown.join(', ')}`, { allowed: PREF_KEYS });
  for (const key of PREF_KEYS) {
    const value = optionalBoolean(req.body, key);
    if (value !== undefined) prefs[key] = value;
  }

  await prisma.user.update({ where: { id: userId }, data: { notificationPrefs: prefs } });
  res.json(prefs);
};

// ---------------------------------------------------------------- Wishlist

export const getWishlist = async (req: Request, res: Response): Promise<void> => {
  const rows = await prisma.wishlist.findMany({
    where: { userId: currentUserId(req) },
    include: { product: { include: productInclude } },
    orderBy: { createdAt: 'desc' },
  });
  const cards = await cardsById(rows.map((r) => r.product));

  const items = rows.map((row) => {
    const card = cards.get(row.productId)!;
    const change = card.bestPrice - round(row.addedPrice);
    return {
      ...card,
      wishlistId: row.id,
      addedAt: row.createdAt.toISOString(),
      addedPrice: round(row.addedPrice),
      change,
      changePercent: row.addedPrice ? Math.round((change / row.addedPrice) * 100) : 0,
    };
  });

  res.json({
    items,
    summary: {
      count: items.length,
      priceDrops: items.filter((i) => i.change < 0).length,
      onSale: items.filter((i) => i.discount >= 10).length,
      totalSavings: items.reduce((sum, i) => sum + Math.max(0, -i.change), 0),
    },
  });
};

export const addToWishlist = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const product = await requireProduct(req.body?.productId);
  const existing = await prisma.wishlist.findUnique({ where: { userId_productId: { userId, productId: product.id } } });
  if (existing) throw new HttpError(409, 'Product already in wishlist');

  const item = await prisma.wishlist.create({
    data: { userId, productId: product.id, addedPrice: product.bestPrice ?? 0 },
  });
  res.status(201).json({ id: item.id, productId: item.productId, addedPrice: round(item.addedPrice), addedAt: item.createdAt.toISOString() });
};

export const removeFromWishlist = async (req: Request, res: Response): Promise<void> => {
  const { count } = await prisma.wishlist.deleteMany({
    where: { userId: currentUserId(req), productId: String(req.params.productId) },
  });
  if (count === 0) throw notFound('Product is not in your wishlist');
  res.status(204).end();
};

// ---------------------------------------------------------------- Watchlist (tracked products)

const NEAR_TARGET_RATIO = 0.05;

export const getWatchlist = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const [rows, alerts] = await Promise.all([
    prisma.watchlist.findMany({
      where: { userId },
      include: { product: { include: productInclude } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.alert.findMany({ where: { userId, isActive: true }, orderBy: { targetPrice: 'desc' } }),
  ]);
  const cards = await cardsById(rows.map((r) => r.product));

  const items = rows.map((row) => {
    const card = cards.get(row.productId)!;
    const alert = alerts.find((a) => a.productId === row.productId) ?? null;
    const targetPrice = alert ? round(alert.targetPrice) : null;
    const distance = targetPrice === null ? null : Math.max(0, card.bestPrice - targetPrice);
    return {
      ...card,
      watchlistId: row.id,
      trackedSince: row.createdAt.toISOString(),
      currentPrice: card.bestPrice,
      targetPrice,
      distance,
      alertId: alert?.id ?? null,
      targetReached: targetPrice !== null && card.bestPrice <= targetPrice,
      nearTarget: distance !== null && distance > 0 && distance <= card.bestPrice * NEAR_TARGET_RATIO,
      priceDropped: card.trend === 'down',
    };
  });

  res.json({
    items,
    summary: {
      count: items.length,
      nearTarget: items.filter((i) => i.nearTarget).length,
      priceDropped: items.filter((i) => i.priceDropped).length,
      targetReached: items.filter((i) => i.targetReached).length,
    },
  });
};

const upsertAlert = async (
  userId: string,
  productId: string,
  targetPrice: number,
  channels: { notifyEmail?: boolean; notifyInApp?: boolean; notifyPush?: boolean },
) => {
  const existing = await prisma.alert.findFirst({ where: { userId, productId, isActive: true } });
  const alert = existing
    ? await prisma.alert.update({ where: { id: existing.id }, data: { targetPrice, triggeredAt: null, lastNotifiedPrice: null, ...channels } })
    : await prisma.alert.create({ data: { userId, productId, targetPrice, ...channels } });
  return { alert, created: !existing };
};

export const addToWatchlist = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const product = await requireProduct(req.body?.productId);
  const targetPrice = optionalNumber(req.body, 'targetPrice');
  if (targetPrice !== undefined && targetPrice <= 0) throw badRequest('targetPrice must be a positive number');

  const existing = await prisma.watchlist.findUnique({ where: { userId_productId: { userId, productId: product.id } } });
  if (existing && targetPrice === undefined) throw new HttpError(409, 'Product already in watchlist');

  const item = existing ?? (await prisma.watchlist.create({ data: { userId, productId: product.id } }));
  let alertId: string | null = null;
  if (targetPrice !== undefined) {
    alertId = (await upsertAlert(userId, product.id, targetPrice, {})).alert.id;
  }

  res.status(existing ? 200 : 201).json({ id: item.id, productId: product.id, trackedSince: item.createdAt.toISOString(), alertId });
};

export const removeFromWatchlist = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const productId = String(req.params.productId);
  const { count } = await prisma.watchlist.deleteMany({ where: { userId, productId } });
  if (count === 0) throw notFound('Product is not in your watchlist');
  // Untracking also stops target alerts for that product.
  await prisma.alert.updateMany({ where: { userId, productId, isActive: true }, data: { isActive: false } });
  res.status(204).end();
};

// ---------------------------------------------------------------- Alerts

const EVENT_TYPES: NotificationType[] = ['PRICE_DROP', 'TARGET_REACHED'];

export const getAlerts = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [alerts, events] = await Promise.all([
    prisma.alert.findMany({
      where: { userId },
      include: { product: { include: productInclude } },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.notification.findMany({
      where: { userId, type: { in: EVENT_TYPES }, productId: { not: null } },
      include: { product: { include: productInclude } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  const cards = await cardsById([...alerts.map((a) => a.product), ...events.map((e) => e.product!)]);

  const eventItems = events.map((e) => {
    const prev = e.prevPrice ?? e.newPrice ?? 0;
    const next = e.newPrice ?? prev;
    return {
      id: e.id,
      product: cards.get(e.productId!)!,
      prevPrice: round(prev),
      newPrice: round(next),
      dropPercent: prev ? Number((((prev - next) / prev) * 100).toFixed(1)) : 0,
      target: e.targetPrice === null ? null : round(e.targetPrice),
      date: e.createdAt.toISOString(),
      status: e.type === 'TARGET_REACHED' ? 'target' : 'drop',
      read: e.read,
    };
  });
  const recent = eventItems.filter((e) => new Date(e.date) >= since);

  res.json({
    summary: {
      activeAlerts: alerts.filter((a) => a.isActive).length,
      priceDrops: recent.filter((e) => e.status === 'drop').length,
      targetReached: recent.filter((e) => e.status === 'target').length,
      potentialSavings: recent.reduce((sum, e) => sum + Math.max(0, e.prevPrice - e.newPrice), 0),
    },
    alerts: alerts.map((a) => {
      const card = cards.get(a.productId)!;
      return {
        id: a.id,
        product: card,
        targetPrice: round(a.targetPrice),
        currentPrice: card.bestPrice,
        distance: Math.max(0, card.bestPrice - round(a.targetPrice)),
        channels: { email: a.notifyEmail, inApp: a.notifyInApp, push: a.notifyPush },
        isActive: a.isActive,
        triggeredAt: a.triggeredAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      };
    }),
    events: eventItems,
  });
};

const channelInput = (body: Record<string, unknown> | undefined) => ({
  notifyEmail: optionalBoolean(body, 'notifyEmail'),
  notifyInApp: optionalBoolean(body, 'notifyInApp'),
  notifyPush: optionalBoolean(body, 'notifyPush'),
});

const withoutUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;

export const addAlert = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const product = await requireProduct(req.body?.productId);
  const targetPrice = requirePositiveNumber(req.body, 'targetPrice');

  const { alert, created } = await upsertAlert(userId, product.id, targetPrice, withoutUndefined(channelInput(req.body)));
  // Setting an alert implies tracking the product.
  await prisma.watchlist.upsert({
    where: { userId_productId: { userId, productId: product.id } },
    update: {},
    create: { userId, productId: product.id },
  });

  if (alert.notifyEmail) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    const bestListing = product.stores?.find((s) => s.storeId === product.bestStoreId) || product.stores?.[0];
    const bestStoreName = product.bestStore?.name || bestListing?.store?.name;
    const appBaseUrl = (env.corsOrigins[0] || 'http://localhost:5173').replace(/\/+$/, '');
    const canonicalProductUrl = `${appBaseUrl}/product/${product.id}`;
    const productUrl =
      bestListing?.productUrl && isValidHttpUrl(bestListing.productUrl) ? bestListing.productUrl : canonicalProductUrl;

    if (user?.email && bestStoreName && product.bestPrice && product.bestPrice > 0) {
      sendPriceAlertConfirmationEmail({
        email: user.email,
        userName: user.name || undefined,
        productName: product.name,
        brand: product.brand,
        currentPrice: product.bestPrice,
        targetPrice,
        bestStore: bestStoreName,
        productUrl,
        imageUrl: product.imageUrl || undefined,
      }).catch((err) => console.error('[Alert Confirmation Email Error]:', err));
    }
  }

  const fresh = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
  res.status(created ? 201 : 200).json({
    id: fresh.id,
    productId: fresh.productId,
    targetPrice: round(fresh.targetPrice),
    channels: { email: fresh.notifyEmail, inApp: fresh.notifyInApp, push: fresh.notifyPush },
    isActive: fresh.isActive,
    triggeredAt: fresh.triggeredAt?.toISOString() ?? null,
  });
};

export const updateAlert = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const alertId = String(req.params.alertId);
  const targetPrice = optionalNumber(req.body, 'targetPrice');
  if (targetPrice !== undefined && targetPrice <= 0) throw badRequest('targetPrice must be a positive number');
  const isActive = optionalBoolean(req.body, 'isActive');

  const existing = await prisma.alert.findFirst({ where: { id: alertId, userId } });
  if (!existing) throw notFound('Alert not found');

  const alert = await prisma.alert.update({
    where: { id: alertId },
    data: {
      ...withoutUndefined({ targetPrice, isActive, ...channelInput(req.body) }),
      ...(targetPrice !== undefined ? { triggeredAt: null, lastNotifiedPrice: null } : {}),
    },
  });
  res.json({
    id: alert.id,
    productId: alert.productId,
    targetPrice: round(alert.targetPrice),
    channels: { email: alert.notifyEmail, inApp: alert.notifyInApp, push: alert.notifyPush },
    isActive: alert.isActive,
    triggeredAt: alert.triggeredAt?.toISOString() ?? null,
  });
};

export const removeAlert = async (req: Request, res: Response): Promise<void> => {
  const { count } = await prisma.alert.deleteMany({ where: { id: String(req.params.alertId), userId: currentUserId(req) } });
  if (count === 0) throw notFound('Alert not found');
  res.status(204).end();
};

// ---------------------------------------------------------------- Notifications

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const limit = queryInt(req.query.limit, 20, { min: 1, max: 100 });
  const unreadOnly = queryString(req.query.unread) === 'true';

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { read: false } : {}) },
      include: { product: { include: productInclude } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);
  const cards = await cardsById(rows.flatMap((r) => (r.product ? [r.product] : [])));

  res.json({
    items: rows.map((n) => ({
      id: n.id,
      type: n.type.toLowerCase(),
      title: n.title,
      body: n.body,
      time: n.createdAt.toISOString(),
      read: n.read,
      product: n.productId ? (cards.get(n.productId) ?? null) : null,
    })),
    unreadCount,
  });
};

export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
  const { count } = await prisma.notification.updateMany({
    where: { id: String(req.params.notificationId), userId: currentUserId(req) },
    data: { read: true },
  });
  if (count === 0) throw notFound('Notification not found');
  res.status(204).end();
};

export const markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
  const { count } = await prisma.notification.updateMany({ where: { userId: currentUserId(req), read: false }, data: { read: true } });
  res.json({ updated: count });
};

// ---------------------------------------------------------------- Recommendations (For You)

const dealScore = (c: ProductCard) => c.rating * 2 + c.discount / 10 + (c.verdictColor === 'green' ? 1 : 0);

export const getRecommendations = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const limit = queryInt(req.query.limit, 8, { min: 1, max: 24 });

  const saved = await prisma.product.findMany({
    where: { OR: [{ watchers: { some: { userId } } }, { wishlistedBy: { some: { userId } } }] },
    select: { id: true, name: true, category: true, brand: true },
  });
  const savedIds = saved.map((s) => s.id);
  const categories = [...new Set(saved.map((s) => s.category))];
  const brands = new Set(saved.map((s) => s.brand.toLowerCase()));

  const personalised = categories.length
    ? await prisma.product.findMany({
        where: { id: { notIn: savedIds }, category: { in: categories } },
        include: productInclude,
        take: 60,
      })
    : [];
  const fallback = await prisma.product.findMany({
    where: { id: { notIn: [...savedIds, ...personalised.map((p) => p.id)] } },
    include: productInclude,
    orderBy: { discountPercent: { sort: 'desc', nulls: 'last' } },
    take: limit,
  });

  const cards = await cardsById([...personalised, ...fallback]);
  const reasonFor = (p: ProductWithStores, card: ProductCard) => {
    const anchor = saved.find((s) => s.category === p.category);
    if (anchor) return brands.has(p.brand.toLowerCase()) ? `More from ${p.brand}, like your saved ${anchor.name}` : `Because you saved ${anchor.name}`;
    return card.discount ? `Trending deal: ${card.discount}% off MRP` : 'Popular with PriceWise shoppers';
  };

  const ranked = [
    ...personalised
      .map((p) => ({ p, card: cards.get(p.id)!, bonus: brands.has(p.brand.toLowerCase()) ? 1 : 0 }))
      .sort((a, b) => dealScore(b.card) + b.bonus - (dealScore(a.card) + a.bonus)),
    ...fallback.map((p) => ({ p, card: cards.get(p.id)!, bonus: 0 })),
  ].slice(0, limit);

  res.json({
    personalised: personalised.length > 0,
    items: ranked.map(({ p, card }) => ({ ...card, reason: reasonFor(p, card) })),
  });
};

// ---------------------------------------------------------------- Email Notifications (Nodemailer)

export const setPriceNotification = async (req: Request, res: Response): Promise<void> => {
  const userId = currentUserId(req);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new HttpError(401, 'Authentication required to set price alerts.');
  }

  const email = req.body?.email ? requireEmail(req.body, 'email') : user.email;
  const targetPrice = requirePositiveNumber(req.body, 'targetPrice');
  const product = await requireProduct(req.body?.productId);
  const userName = optionalString(req.body, 'userName') || user.name || 'Shopper';

  // Create or update alert in database
  const { alert } = await upsertAlert(userId, product.id, targetPrice, {
    notifyEmail: true,
    notifyInApp: true,
    notifyPush: false,
  });

  // Track product
  await prisma.watchlist.upsert({
    where: { userId_productId: { userId, productId: product.id } },
    update: {},
    create: { userId, productId: product.id },
  });

  // Send confirmation email via Nodemailer
  const bestListing = product.stores?.find((s) => s.storeId === product.bestStoreId) || product.stores?.[0];
  const bestStoreName = product.bestStore?.name || bestListing?.store?.name;
  if (!bestStoreName) {
    throw badRequest('This product has no active retailer listings.');
  }
  if (!product.bestPrice || product.bestPrice <= 0) {
    throw badRequest('This product has no verified current price.');
  }
  const appBaseUrl = (env.corsOrigins[0] || 'http://localhost:5173').replace(/\/+$/, '');
  const canonicalProductUrl = `${appBaseUrl}/product/${product.id}`;
  const productUrl =
    bestListing?.productUrl && isValidHttpUrl(bestListing.productUrl) ? bestListing.productUrl : canonicalProductUrl;

  const emailResult = await sendPriceAlertConfirmationEmail({
    email,
    userName,
    productName: product.name,
    brand: product.brand,
    currentPrice: product.bestPrice,
    targetPrice,
    bestStore: bestStoreName,
    productUrl,
    imageUrl: product.imageUrl || undefined,
  });

  res.status(200).json({
    success: true,
    message: `Price alert activated! Confirmation email sent to ${email}.`,
    alertId: alert.id,
    emailResult,
  });
};

export const testPriceAlertEmail = async (req: Request, res: Response): Promise<void> => {
  const email = requireEmail(req.body, 'email');
  const product = await requireProduct(req.body?.productId);

  if (isSyntheticProduct(product)) {
    throw badRequest('Cannot send price alert emails for synthetic seed products. Please select a genuine tracked product.');
  }

  const currentPrice = product.bestPrice;
  if (!currentPrice || currentPrice <= 0) {
    throw badRequest('Product has no verified current price in database.');
  }

  const bestListing = product.stores?.find((s) => s.storeId === product.bestStoreId) || product.stores?.[0];
  const bestStoreName = product.bestStore?.name || bestListing?.store?.name;
  if (!bestStoreName) {
    throw badRequest('Product has no verified store listing in database.');
  }

  // Look up genuine historical price points to find a verified previous price
  const history = await prisma.priceHistory.findMany({
    where: { productStore: { productId: product.id } },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  const previousHigherPrice = history.find((h) => h.price > currentPrice)?.price || null;
  const previousPrice = previousHigherPrice ?? (product.mrp && product.mrp > currentPrice ? product.mrp : null);

  const appBaseUrl = (env.corsOrigins[0] || 'http://localhost:5173').replace(/\/+$/, '');
  const canonicalProductUrl = `${appBaseUrl}/product/${product.id}`;
  const productUrl =
    bestListing?.productUrl && isValidHttpUrl(bestListing.productUrl) ? bestListing.productUrl : canonicalProductUrl;

  const result = await sendPriceDropAlertEmail({
    email,
    userName: optionalString(req.body, 'userName') || 'Shopper',
    productName: product.name,
    brand: product.brand,
    previousPrice,
    currentPrice,
    targetPrice: currentPrice,
    dropAmount: previousPrice && previousPrice > currentPrice ? previousPrice - currentPrice : undefined,
    bestStore: bestStoreName,
    productUrl,
    imageUrl: product.imageUrl || undefined,
  });

  if (!result.success) {
    throw new HttpError(400, result.error || 'Failed to send price drop alert email');
  }

  res.json({ success: true, message: `Test price drop alert email sent to ${email}`, result });
};

