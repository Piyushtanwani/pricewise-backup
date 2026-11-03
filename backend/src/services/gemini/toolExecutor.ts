import prisma from '../../utils/prisma';
import {
  ProductCard,
  ProductWithStores,
  loadDailySeries,
  productInclude,
  toProductCard,
} from '../productService';
import {
  computeStats,
  computeTrend,
  computeVerdict,
  percentChange,
  sliceByDays,
} from '../priceAnalytics';
import { getPricePrediction, seriesFor } from '../historyService';

/** Helper to resolve product either by ID or fuzzy name match */
async function resolveProduct(productId?: string, productName?: string): Promise<ProductWithStores | null> {
  if (productId) {
    const byId = await prisma.product.findUnique({
      where: { id: productId },
      include: productInclude,
    });
    if (byId) return byId;
  }
  if (productName && productName.trim()) {
    const q = productName.trim();
    // 1. Direct contains
    const direct = await prisma.product.findFirst({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: productInclude,
    });
    if (direct) return direct;

    // 2. Tokenized search
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const candidates = await prisma.product.findMany({
      take: 200,
      include: productInclude,
    });
    let bestMatch: ProductWithStores | null = null;
    let maxHits = 0;
    for (const c of candidates) {
      const full = `${c.brand} ${c.name}`.toLowerCase();
      const hits = tokens.filter((t) => full.includes(t)).length;
      if (hits > maxHits) {
        maxHits = hits;
        bestMatch = c;
      }
    }
    if (maxHits > 0) return bestMatch;
  }
  return null;
}

export class ToolExecutor {
  /**
   * Dispatches tool invocation to the respective implementation.
   */
  static async execute(name: string, args: Record<string, any>): Promise<any> {
    try {
      switch (name) {
        case 'search_products':
          return await ToolExecutor.searchProducts(args);
        case 'get_product_details':
          return await ToolExecutor.getProductDetails(args);
        case 'get_category_information':
          return await ToolExecutor.getCategoryInformation();
        case 'compare_products':
          return await ToolExecutor.compareProducts(args);
        case 'get_best_deals':
          return await ToolExecutor.getBestDeals(args);
        case 'get_store_prices':
          return await ToolExecutor.getStorePrices(args);
        case 'get_price_history':
          return await ToolExecutor.getPriceHistory(args);
        case 'get_price_prediction':
          return await ToolExecutor.getPricePrediction(args);
        case 'get_category_recommendations':
          return await ToolExecutor.getCategoryRecommendations(args as any);
        case 'get_cheaper_alternatives':
          return await ToolExecutor.getCheaperAlternatives(args);
        case 'get_product_reviews_summary':
          return await ToolExecutor.getProductReviewsSummary(args);
        default:
          return { error: `Tool ${name} not implemented.` };
      }
    } catch (err: any) {
      console.error(`[ToolExecutor] Error executing ${name}:`, err);
      return { error: err.message || 'Tool execution failed' };
    }
  }

  static async searchProducts(args: {
    query?: string;
    category?: string;
    brand?: string;
    maxBudget?: number;
    minBudget?: number;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(args.limit || 5, 1), 10);
    const where: any = {};

    if (args.category) {
      where.category = { contains: args.category.trim(), mode: 'insensitive' };
    }
    if (args.brand) {
      where.brand = { contains: args.brand.trim(), mode: 'insensitive' };
    }
    if (args.maxBudget !== undefined || args.minBudget !== undefined) {
      where.bestPrice = {};
      if (args.maxBudget !== undefined) where.bestPrice.lte = Number(args.maxBudget);
      if (args.minBudget !== undefined) where.bestPrice.gte = Number(args.minBudget);
    }
    if (args.query && args.query.trim()) {
      const q = args.query.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      take: limit,
      orderBy: [{ bestPrice: 'asc' }, { reviewCount: 'desc' }],
      include: productInclude,
    });

    const seriesMap = await loadDailySeries(products.map((p) => p.id), { days: 60 });
    return {
      count: products.length,
      products: products.map((p) => {
        const card = toProductCard(p, seriesMap.get(p.id));
        return {
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          bestPrice: card.bestPrice,
          mrp: card.mrp,
          discount: card.discount,
          bestStore: card.bestStore,
          availableStores: card.stores,
          rating: card.rating,
          reviewCount: card.reviews,
          verdict: card.aiVerdict,
          specs: p.specs,
          techSpecs: p.techSpecs,
        };
      }),
    };
  }

  static async getProductDetails(args: { productId?: string; productName?: string }) {
    const product = await resolveProduct(args.productId, args.productName);
    if (!product) {
      return { error: `Product not found for ${args.productId || args.productName}` };
    }

    const series = await seriesFor(product.id, null, undefined, product.bestPrice);
    const card = toProductCard(product, series);
    const verdict = computeVerdict(series);

    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      image: card.image,
      bestPrice: card.bestPrice,
      mrp: card.mrp,
      discount: card.discount,
      bestStore: card.bestStore,
      rating: card.rating,
      reviewCount: card.reviews,
      stores: product.stores.map((s) => ({
        storeName: s.store.name,
        price: s.currentPrice,
        mrp: s.mrp,
        availability: s.stockStatus === 'IN_STOCK' ? 'In Stock' : 'Limited',
        url: s.productUrl,
      })),
      techSpecs: product.techSpecs || {},
      specs: product.specs || {},
      verdict: verdict.label,
      verdictReason: verdict.explanation,
    };
  }

  static async getCategoryInformation() {
    const categories = await prisma.product.findMany({
      select: { category: true, brand: true },
    });
    const categoryMap: Record<string, Set<string>> = {};
    for (const item of categories) {
      if (!categoryMap[item.category]) {
        categoryMap[item.category] = new Set();
      }
      categoryMap[item.category].add(item.brand);
    }

    return {
      categories: Object.keys(categoryMap).map((cat) => ({
        name: cat,
        brands: Array.from(categoryMap[cat]).slice(0, 15),
      })),
    };
  }

  static async compareProducts(args: { productIds?: string[]; productNames?: string[] }) {
    const targets: ProductWithStores[] = [];
    if (Array.isArray(args.productIds)) {
      for (const id of args.productIds) {
        const p = await resolveProduct(id);
        if (p && !targets.some((t) => t.id === p.id)) targets.push(p);
      }
    }
    if (Array.isArray(args.productNames)) {
      for (const name of args.productNames) {
        const p = await resolveProduct(undefined, name);
        if (p && !targets.some((t) => t.id === p.id)) targets.push(p);
      }
    }

    if (targets.length < 2) {
      return { error: 'Please specify at least 2 distinct products to compare.' };
    }

    const seriesMap = await loadDailySeries(targets.map((t) => t.id), { days: 90 });
    const comparisons = targets.map((p) => {
      const card = toProductCard(p, seriesMap.get(p.id));
      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        bestPrice: card.bestPrice,
        mrp: card.mrp,
        discount: card.discount,
        bestStore: card.bestStore,
        rating: card.rating,
        reviewCount: card.reviews,
        specs: p.specs,
        techSpecs: p.techSpecs,
        verdict: card.aiVerdict,
      };
    });

    // Determine key advantages
    const lowestPrice = Math.min(...comparisons.map((c) => c.bestPrice));
    const highestRated = Math.max(...comparisons.map((c) => c.rating));

    return {
      count: comparisons.length,
      items: comparisons,
      summary: {
        cheapest: comparisons.find((c) => c.bestPrice === lowestPrice)?.name,
        highestRating: comparisons.find((c) => c.rating === highestRated)?.name,
      },
    };
  }

  static async getBestDeals(args: { category?: string; maxBudget?: number; limit?: number }) {
    const limit = Math.min(Math.max(args.limit || 5, 1), 10);
    const where: any = {
      bestPrice: { gt: 0 },
    };
    if (args.category) {
      where.category = { contains: args.category.trim(), mode: 'insensitive' };
    }
    if (args.maxBudget) {
      where.bestPrice.lte = Number(args.maxBudget);
    }

    const products = await prisma.product.findMany({
      where,
      take: 50,
      include: productInclude,
    });

    const seriesMap = await loadDailySeries(products.map((p) => p.id), { days: 60 });
    const cards = products
      .map((p) => toProductCard(p, seriesMap.get(p.id)))
      .filter((c) => c.discount > 0)
      .sort((a, b) => b.discount - a.discount)
      .slice(0, limit);

    return {
      count: cards.length,
      deals: cards.map((c) => ({
        id: c.id,
        name: c.name,
        brand: c.brand,
        bestPrice: c.bestPrice,
        mrp: c.mrp,
        discountPercent: c.discount,
        store: c.bestStore,
        rating: c.rating,
        verdict: c.aiVerdict,
      })),
    };
  }

  static async getStorePrices(args: { productId?: string; productName?: string }) {
    const product = await resolveProduct(args.productId, args.productName);
    if (!product) {
      return { error: `Product not found for ${args.productId || args.productName}` };
    }

    const stores = product.stores.map((s) => ({
      store: s.store.name,
      currentPrice: s.currentPrice,
      mrp: s.mrp,
      discountPercent: s.mrp && s.currentPrice ? Math.round(((s.mrp - s.currentPrice) / s.mrp) * 100) : 0,
      availability: s.stockStatus === 'IN_STOCK' ? 'In Stock' : 'Limited',
      productUrl: s.productUrl,
    }));

    return {
      productId: product.id,
      productName: product.name,
      brand: product.brand,
      bestPrice: product.bestPrice,
      stores: stores.sort((a, b) => a.currentPrice - b.currentPrice),
    };
  }

  static async getPriceHistory(args: { productId?: string; productName?: string; days?: number }) {
    const product = await resolveProduct(args.productId, args.productName);
    if (!product) {
      return { error: `Product not found for ${args.productId || args.productName}` };
    }

    const days = args.days || 90;
    const series = await seriesFor(product.id, null, undefined, product.bestPrice);
    const window = sliceByDays(series, days);
    const stats = computeStats(window);
    const trend = computeTrend(window);
    const changePct = window.length > 1 ? percentChange(window[0].price, window[window.length - 1].price) : 0;
    const allTimeStats = computeStats(series);

    return {
      productId: product.id,
      productName: product.name,
      daysTracked: window.length,
      currentPrice: product.bestPrice,
      allTimeLowest: allTimeStats?.lowest ?? null,
      allTimeHighest: allTimeStats?.highest ?? null,
      periodAverage: stats?.average ?? null,
      periodLowest: stats?.lowest ?? null,
      trend,
      percentChange: Number(changePct.toFixed(1)),
      verdict: computeVerdict(series).label,
    };
  }

  static async getPricePrediction(args: { productId?: string; productName?: string }) {
    const product = await resolveProduct(args.productId, args.productName);
    if (!product) {
      return { error: `Product not found for ${args.productId || args.productName}` };
    }

    const prediction = await getPricePrediction(product.id);
    return {
      productId: product.id,
      productName: product.name,
      currentPrice: product.bestPrice,
      predictedPrice30d: prediction.predicted30d,
      potentialSaving: prediction.potentialSaving,
      confidence: prediction.confidence,
      trend: prediction.trend,
      recommendation: prediction.recommendation,
      source: prediction.source,
      explanation: prediction.explanation,
    };
  }

  static async getCategoryRecommendations(args: {
    category?: string;
    budget?: number;
    priority?: string;
    limit?: number;
  }) {
    const budget = Number(args.budget) || 100000;
    const limit = Math.min(Math.max(args.limit || 3, 1), 5);
    const where: any = {
      bestPrice: { lte: budget, gt: 0 },
    };
    if (args.category) {
      where.category = { contains: args.category.trim(), mode: 'insensitive' };
    }

    const products = await prisma.product.findMany({
      where,
      take: 30,
      include: productInclude,
    });

    if (products.length === 0) {
      const closest = await prisma.product.findFirst({
        where: args.category ? { category: { contains: args.category.trim(), mode: 'insensitive' } } : {},
        orderBy: { bestPrice: 'asc' },
        include: productInclude,
      });
      return {
        count: 0,
        message: `No products found strictly under ₹${budget.toLocaleString('en-IN')}`,
        closestAlternative: closest
          ? {
              id: closest.id,
              name: closest.name,
              bestPrice: closest.bestPrice,
              diffFromBudget: (closest.bestPrice ?? 0) - budget,
            }
          : null,
      };
    }

    const seriesMap = await loadDailySeries(products.map((p) => p.id), { days: 60 });
    const cards = products.map((p) => toProductCard(p, seriesMap.get(p.id)));

    const priority = (args.priority || 'overall').toLowerCase();
    const scored = cards.sort((a, b) => {
      if (priority === 'value') {
        const valA = a.rating * 2 + a.discount / 10 + (a.verdictColor === 'green' ? 1 : 0);
        const valB = b.rating * 2 + b.discount / 10 + (b.verdictColor === 'green' ? 1 : 0);
        return valB - valA;
      }
      return b.rating * 2 + Math.log10(b.reviews + 1) - (a.rating * 2 + Math.log10(a.reviews + 1));
    });

    return {
      count: Math.min(scored.length, limit),
      priority,
      budget,
      recommendations: scored.slice(0, limit).map((c) => ({
        id: c.id,
        name: c.name,
        brand: c.brand,
        bestPrice: c.bestPrice,
        mrp: c.mrp,
        discount: c.discount,
        rating: c.rating,
        reviews: c.reviews,
        bestStore: c.bestStore,
        verdict: c.aiVerdict,
      })),
    };
  }

  static async getCheaperAlternatives(args: { productId?: string; productName?: string; maxBudget?: number }) {
    const product = await resolveProduct(args.productId, args.productName);
    if (!product) {
      return { error: `Product not found for ${args.productId || args.productName}` };
    }

    const targetPrice = product.bestPrice || 0;
    const ceiling = args.maxBudget ? Math.min(args.maxBudget, targetPrice) : targetPrice;

    const alternatives = await prisma.product.findMany({
      where: {
        id: { not: product.id },
        category: product.category,
        bestPrice: { lt: ceiling, gt: 0 },
      },
      take: 10,
      orderBy: [{ rating: 'desc' }, { bestPrice: 'asc' }],
      include: productInclude,
    });

    if (alternatives.length === 0) {
      return {
        message: `${product.name} is already the lowest-priced tracked option in ${product.category}.`,
        targetProduct: { id: product.id, name: product.name, price: product.bestPrice },
        alternatives: [],
      };
    }

    const seriesMap = await loadDailySeries(alternatives.map((p) => p.id), { days: 60 });
    return {
      targetProduct: { id: product.id, name: product.name, price: product.bestPrice },
      alternatives: alternatives.slice(0, 3).map((a) => {
        const card = toProductCard(a, seriesMap.get(a.id));
        return {
          id: a.id,
          name: a.name,
          brand: a.brand,
          bestPrice: card.bestPrice,
          savings: targetPrice - card.bestPrice,
          rating: card.rating,
          reviewCount: card.reviews,
          bestStore: card.bestStore,
          verdict: card.aiVerdict,
        };
      }),
    };
  }

  static async getProductReviewsSummary(args: { productId?: string; productName?: string }) {
    const product = await resolveProduct(args.productId, args.productName);
    if (!product) {
      return { error: `Product not found for ${args.productId || args.productName}` };
    }

    return {
      productId: product.id,
      productName: product.name,
      rating: product.rating,
      reviewCount: product.reviewCount,
      sentimentSummary:
        product.reviewCount > 1000
          ? `Strongly positive buyer sentiment with ${product.reviewCount.toLocaleString('en-IN')} verified reviews.`
          : product.reviewCount > 50
            ? `Moderate buyer activity with ${product.reviewCount} ratings.`
            : `Limited buyer review data available in current catalogue.`,
    };
  }
}
