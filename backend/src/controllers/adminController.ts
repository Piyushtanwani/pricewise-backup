import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { HttpError, badRequest, notFound } from '../utils/http';
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  queryInt,
  queryString,
  requirePositiveNumber,
  requireString,
} from '../utils/validate';
import { refreshProductAggregates, resolveProductImageUrl } from '../services/productService';
import { checkActivePriceAlerts } from '../services/priceAlertMonitorService';
import { getSchedulerState } from '../jobs/priceAlertScheduler';
import { NotificationJobStatus } from '../generated/prisma';

// -----------------------------------------------------------------------------
// 1. REPORTS & ANALYTICS
// -----------------------------------------------------------------------------

export const getAdminReports = async (_req: Request, res: Response): Promise<void> => {
  const [
    totalUsers,
    totalProducts,
    totalStores,
    totalListings,
    totalAlerts,
    activeAlerts,
    totalNotifications,
    notificationsByType,
    jobStats,
    recentUsers,
    recentNotifications,
    topTrackedProductsRaw,
    storesWithProducts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.product.count(),
    prisma.store.count(),
    prisma.productStore.count(),
    prisma.alert.count(),
    prisma.alert.count({ where: { isActive: true } }),
    prisma.notification.count(),
    prisma.notification.groupBy({
      by: ['type'],
      _count: { id: true },
    }),
    prisma.notificationJob.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, role: true, isBanned: true, createdAt: true },
    }),
    prisma.notification.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
        product: { select: { id: true, name: true, brand: true, bestPrice: true } },
      },
    }),
    prisma.alert.groupBy({
      by: ['productId'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 8,
    }),
    prisma.store.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { products: true, bestProducts: true } },
      },
    }),
  ]);

  // Fetch product cards for top tracked products
  const topProductIds = topTrackedProductsRaw.map((t) => t.productId);
  const topProductsMap = new Map(
    (
      await prisma.product.findMany({
        where: { id: { in: topProductIds } },
        select: { id: true, name: true, brand: true, bestPrice: true, mrp: true, imageUrl: true },
      })
    ).map((p) => [p.id, p])
  );

  const topTracked = topTrackedProductsRaw.map((t) => ({
    product: topProductsMap.get(t.productId) || { id: t.productId, name: 'Unknown Device', brand: '' },
    alertsCount: t._count.id,
  }));

  const notificationCounts = Object.fromEntries(notificationsByType.map((n) => [n.type, n._count.id]));
  const jobsByStatus = Object.fromEntries(jobStats.map((j) => [j.status, j._count.id]));

  const scheduler = getSchedulerState();

  res.json({
    summary: {
      totalUsers,
      totalProducts,
      totalStores,
      totalListings,
      totalAlerts,
      activeAlerts,
      totalNotifications,
    },
    notifications: {
      priceDrops: notificationCounts['PRICE_DROP'] || 0,
      targetReached: notificationCounts['TARGET_REACHED'] || 0,
      backInStock: notificationCounts['BACK_IN_STOCK'] || 0,
      recommendations: notificationCounts['RECOMMENDATION'] || 0,
    },
    notificationJobs: {
      pending: jobsByStatus['PENDING'] || 0,
      processing: jobsByStatus['PROCESSING'] || 0,
      sent: jobsByStatus['SENT'] || 0,
      failed: jobsByStatus['FAILED'] || 0,
    },
    stores: storesWithProducts.map((s) => ({
      id: s.id,
      name: s.name,
      slug: s.slug,
      totalListings: s._count.products,
      bestPriceDeals: s._count.bestProducts,
    })),
    topTracked,
    recentUsers,
    recentNotifications: recentNotifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      user: n.user,
      product: n.product,
    })),
    systemHealth: {
      monitorRunning: scheduler.isRunning,
      monitorIntervalMs: scheduler.intervalMs,
      cycleCount: scheduler.cycleCount,
      lastRunAt: scheduler.lastCycleFinishedAt?.toISOString() || null,
      serverTime: new Date().toISOString(),
    },
  });
};

// -----------------------------------------------------------------------------
// 2. PRODUCT MANAGEMENT (CRUD)
// -----------------------------------------------------------------------------

export const getAdminProducts = async (req: Request, res: Response): Promise<void> => {
  const page = queryInt(req.query.page, 1, { min: 1 });
  const limit = queryInt(req.query.limit, 20, { min: 1, max: 100 });
  const q = queryString(req.query.q)?.trim();
  const brand = queryString(req.query.brand)?.trim();
  const stockFilter = queryString(req.query.stock); // 'IN_STOCK' | 'OUT_OF_STOCK'

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (brand && brand !== 'all') {
    where.brand = { equals: brand, mode: 'insensitive' };
  }
  if (stockFilter === 'IN_STOCK') {
    where.stores = { some: { stockStatus: 'IN_STOCK' } };
  } else if (stockFilter === 'OUT_OF_STOCK') {
    where.stores = { none: { stockStatus: 'IN_STOCK' } };
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        bestStore: true,
        stores: {
          include: { store: true },
          orderBy: { currentPrice: 'asc' },
        },
        _count: { select: { alerts: true, watchers: true } },
      },
    }),
  ]);

  res.json({
    products: products.map((p) => {
      const stores = p.stores || [];
      const inStock = stores.some((s) => s.stockStatus === 'IN_STOCK');
      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        imageUrl: resolveProductImageUrl(p.imageUrl, p.brand, 'card'),
        rawImageUrl: p.imageUrl,
        mrp: p.mrp,
        bestPrice: p.bestPrice,
        bestStore: p.bestStore?.name || null,
        stockStatus: inStock ? 'IN_STOCK' : 'OUT_OF_STOCK',
        specs: p.specs,
        techSpecs: p.techSpecs,
        listingsCount: stores.length,
        alertsCount: p._count.alerts,
        stores: stores.map((s) => ({
          id: s.id,
          storeId: s.storeId,
          storeName: s.store.name,
          currentPrice: s.currentPrice,
          mrp: s.mrp,
          stockStatus: s.stockStatus,
          productUrl: s.productUrl,
        })),
        createdAt: p.createdAt.toISOString(),
      };
    }),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

export const getAdminProductById = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      bestStore: true,
      stores: {
        include: { store: true },
        orderBy: { currentPrice: 'asc' },
      },
      _count: { select: { alerts: true, watchers: true, wishlistedBy: true } },
    },
  });
  if (!product) throw notFound('Product not found');
  res.json({
    ...product,
    imageUrl: resolveProductImageUrl(product.imageUrl, product.brand, 'card'),
    rawImageUrl: product.imageUrl,
  });
};

export const createAdminProduct = async (req: Request, res: Response): Promise<void> => {
  const name = requireString(req.body, 'name', { min: 2, max: 200 });
  const brand = requireString(req.body, 'brand', { min: 2, max: 80 });
  const category = optionalString(req.body, 'category') || 'Mobiles';
  const imageUrl = optionalString(req.body, 'imageUrl');
  const mrp = optionalNumber(req.body, 'mrp');
  const specs = Array.isArray(req.body?.specs) ? req.body.specs.map(String) : [];
  const techSpecs = typeof req.body?.techSpecs === 'object' && req.body?.techSpecs !== null ? req.body.techSpecs : {};
  const description = optionalString(req.body, 'description');

  // Stores array: [{ storeName: 'Amazon', currentPrice: 50000, productUrl: '...', stockStatus: 'IN_STOCK' }]
  const storesInput = Array.isArray(req.body?.stores) ? req.body.stores : [];

  // 1. Create base product
  const product = await prisma.product.create({
    data: {
      name,
      brand,
      category,
      imageUrl: imageUrl || null,
      mrp: mrp && mrp > 0 ? mrp : null,
      specs,
      techSpecs,
      description: description || null,
      rating: 4.5,
      reviewCount: 50,
    },
  });

  // 2. Attach store listings if provided
  for (const st of storesInput) {
    const storeName = st.storeName || st.store;
    if (!storeName || !st.currentPrice) continue;

    const storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const store = await prisma.store.upsert({
      where: { slug: storeSlug },
      update: { name: storeName },
      create: { name: storeName, slug: storeSlug },
    });

    const currentPrice = Number(st.currentPrice);
    const storeListing = await prisma.productStore.create({
      data: {
        productId: product.id,
        storeId: store.id,
        currentPrice,
        mrp: st.mrp ? Number(st.mrp) : mrp ? mrp : currentPrice,
        productUrl: st.productUrl || 'https://www.google.com/search?q=' + encodeURIComponent(name),
        stockStatus: st.stockStatus === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK' : 'IN_STOCK',
      },
    });

    // Record initial price history
    await prisma.priceHistory.create({
      data: {
        productStoreId: storeListing.id,
        price: currentPrice,
      },
    });
  }

  // 3. Recalculate aggregates
  await refreshProductAggregates(product.id);

  const full = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    include: { bestStore: true, stores: { include: { store: true } } },
  });

  res.status(201).json({
    success: true,
    message: `Product "${full.name}" successfully created`,
    product: full,
  });
};

export const updateAdminProduct = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const existing = await prisma.product.findUnique({
    where: { id },
    include: { stores: true },
  });
  if (!existing) throw notFound('Product not found');

  const name = optionalString(req.body, 'name');
  const brand = optionalString(req.body, 'brand');
  const category = optionalString(req.body, 'category');
  const imageUrl = optionalString(req.body, 'imageUrl');
  const mrp = optionalNumber(req.body, 'mrp');
  const specs = Array.isArray(req.body?.specs) ? req.body.specs.map(String) : undefined;
  const techSpecs = typeof req.body?.techSpecs === 'object' && req.body?.techSpecs !== null ? req.body.techSpecs : undefined;
  const description = optionalString(req.body, 'description');

  // Update base product
  await prisma.product.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(brand ? { brand } : {}),
      ...(category ? { category } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(mrp !== undefined ? { mrp } : {}),
      ...(specs !== undefined ? { specs } : {}),
      ...(techSpecs !== undefined ? { techSpecs } : {}),
      ...(description !== undefined ? { description } : {}),
    },
  });

  // Update or insert store listings if provided
  const storesInput = Array.isArray(req.body?.stores) ? req.body.stores : [];
  for (const st of storesInput) {
    const storeName = st.storeName || st.store;
    if (!storeName || st.currentPrice === undefined) continue;

    const storeSlug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const store = await prisma.store.upsert({
      where: { slug: storeSlug },
      update: { name: storeName },
      create: { name: storeName, slug: storeSlug },
    });

    const currentPrice = Number(st.currentPrice);
    const existingListing = existing.stores.find((s) => s.storeId === store.id);

    if (existingListing) {
      const priceChanged = existingListing.currentPrice !== currentPrice;
      await prisma.productStore.update({
        where: { id: existingListing.id },
        data: {
          currentPrice,
          mrp: st.mrp ? Number(st.mrp) : existingListing.mrp,
          productUrl: st.productUrl || existingListing.productUrl,
          stockStatus: st.stockStatus || existingListing.stockStatus,
          lastCheckedAt: new Date(),
        },
      });

      if (priceChanged) {
        await prisma.priceHistory.create({
          data: { productStoreId: existingListing.id, price: currentPrice },
        });
      }
    } else {
      const createdListing = await prisma.productStore.create({
        data: {
          productId: id,
          storeId: store.id,
          currentPrice,
          mrp: st.mrp ? Number(st.mrp) : currentPrice,
          productUrl: st.productUrl || 'https://www.google.com/search?q=' + encodeURIComponent(name || existing.name),
          stockStatus: st.stockStatus || 'IN_STOCK',
        },
      });
      await prisma.priceHistory.create({
        data: { productStoreId: createdListing.id, price: currentPrice },
      });
    }
  }

  // Recalculate best price and store
  await refreshProductAggregates(id);

  const updated = await prisma.product.findUniqueOrThrow({
    where: { id },
    include: { bestStore: true, stores: { include: { store: true } } },
  });

  res.json({
    success: true,
    message: `Product "${updated.name}" updated successfully`,
    product: updated,
  });
};

export const deleteAdminProduct = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) throw notFound('Product not found');

  // Cascade cleanup for relations
  await prisma.$transaction(async (tx) => {
    await tx.notificationJob.deleteMany({ where: { productId: id } });
    await tx.notification.deleteMany({ where: { productId: id } });
    await tx.alert.deleteMany({ where: { productId: id } });
    await tx.watchlist.deleteMany({ where: { productId: id } });
    await tx.wishlist.deleteMany({ where: { productId: id } });
    await tx.priceHistory.deleteMany({ where: { productStore: { productId: id } } });
    await tx.productStore.deleteMany({ where: { productId: id } });
    await tx.product.delete({ where: { id } });
  });

  res.json({
    success: true,
    message: `Product "${existing.name}" and associated records successfully deleted`,
  });
};

// -----------------------------------------------------------------------------
// 3. USER MANAGEMENT
// -----------------------------------------------------------------------------

export const getAdminUsers = async (req: Request, res: Response): Promise<void> => {
  const page = queryInt(req.query.page, 1, { min: 1 });
  const limit = queryInt(req.query.limit, 20, { min: 1, max: 100 });
  const q = queryString(req.query.q)?.trim();
  const roleFilter = queryString(req.query.role); // 'USER' | 'ADMIN'

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (roleFilter && (roleFilter === 'USER' || roleFilter === 'ADMIN')) {
    where.role = roleFilter;
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isBanned: true,
        createdAt: true,
        _count: {
          select: { alerts: true, watchlist: true, wishlist: true },
        },
      },
    }),
  ]);

  res.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      isBanned: u.isBanned,
      alertsCount: u._count.alerts,
      watchlistCount: u._count.watchlist,
      wishlistCount: u._count.wishlist,
      createdAt: u.createdAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

export const updateAdminUserRole = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const role = requireString(req.body, 'role') as 'USER' | 'ADMIN';
  if (role !== 'USER' && role !== 'ADMIN') throw badRequest('Role must be USER or ADMIN');

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('User not found');

  // Prevent accidental self-demotion
  if (req.user?.id === user.id && role === 'USER') {
    throw badRequest('You cannot demote your own account');
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });

  res.json({
    success: true,
    message: `Role for ${updated.name} updated to ${updated.role}`,
    user: updated,
  });
};

export const toggleAdminUserBan = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('User not found');

  if (req.user?.id === user.id) {
    throw badRequest('You cannot suspend your own account');
  }

  const newBanState = !user.isBanned;
  const updated = await prisma.user.update({
    where: { id },
    data: { isBanned: newBanState },
    select: { id: true, name: true, email: true, isBanned: true },
  });

  res.json({
    success: true,
    message: `User ${updated.name} has been ${newBanState ? 'suspended' : 'reactivated'}`,
    user: updated,
  });
};

export const deleteAdminUser = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('User not found');

  if (req.user?.id === user.id) {
    throw badRequest('You cannot delete your own account');
  }

  await prisma.user.delete({ where: { id } });
  res.json({ success: true, message: `Account for ${user.email} was deleted` });
};

// -----------------------------------------------------------------------------
// 4. NOTIFICATION QUEUE & MONITOR ACTIONS
// -----------------------------------------------------------------------------

export const getAdminNotificationQueue = async (req: Request, res: Response): Promise<void> => {
  const page = queryInt(req.query.page, 1, { min: 1 });
  const limit = queryInt(req.query.limit, 25, { min: 1, max: 100 });
  const statusFilter = queryString(req.query.status); // PENDING, PROCESSING, SENT, FAILED

  const where: any = {};
  if (statusFilter && ['PENDING', 'PROCESSING', 'SENT', 'FAILED'].includes(statusFilter)) {
    where.status = statusFilter;
  }

  const [total, jobs] = await Promise.all([
    prisma.notificationJob.count({ where }),
    prisma.notificationJob.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        alert: {
          include: {
            user: { select: { name: true, email: true } },
            product: { select: { id: true, name: true, brand: true, bestPrice: true } },
          },
        },
      },
    }),
  ]);

  res.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      jobType: j.jobType,
      status: j.status,
      triggerPrice: j.triggerPrice,
      previousPrice: j.previousPrice,
      targetPrice: j.targetPrice,
      attempts: j.attempts,
      maxAttempts: j.maxAttempts,
      error: j.lastError,
      user: j.alert?.user || null,
      product: j.alert?.product || null,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

export const retryAdminNotificationJob = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const job = await prisma.notificationJob.findUnique({ where: { id } });
  if (!job) throw notFound('Notification job not found');

  const updated = await prisma.notificationJob.update({
    where: { id },
    data: {
      status: NotificationJobStatus.PENDING,
      attempts: 0,
      lastError: null,
      lockedAt: null,
      lockedBy: null,
    },
  });

  res.json({
    success: true,
    message: `Job ${id} reset to PENDING for next monitoring cycle dispatch`,
    job: updated,
  });
};

export const triggerAdminMonitorCycle = async (_req: Request, res: Response): Promise<void> => {
  const result = await checkActivePriceAlerts();
  res.json({
    success: true,
    message: 'Price and restock alert cycle executed manually',
    result,
  });
};
