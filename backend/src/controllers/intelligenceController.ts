import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { notFound } from '../utils/http';
import { queryList, queryString, requireString } from '../utils/validate';
import { computeStats, parseRange, percentChange, sliceByDays } from '../services/priceAnalytics';
import { toProductCard } from '../services/productService';
import { findProductOr404, getPriceHistory, getPricePrediction, seriesFor } from '../services/historyService';
import { answer } from '../services/assistant';

import { getMarketIntelligenceSummary } from '../services/marketIntelligenceService';

/**
 * Returns market-wide intelligence: direction, verified price drops, retailer competitiveness,
 * volatility ranking, and buying opportunities across genuine catalogue products.
 */
export const getMarketIntelligence = async (req: Request, res: Response): Promise<void> => {
  const forceRefresh = req.query.refresh === 'true';
  const summary = await getMarketIntelligenceSummary({ forceRefresh });
  res.json(summary);
};

/**
 * Everything the Price Intelligence page needs for one product in a single call.
 * Defaults to the most-reviewed product when no productId is given.
 */
export const getPriceIntelligence = async (req: Request, res: Response): Promise<void> => {
  let productId = queryString(req.query.productId);
  if (!productId) {
    const top = await prisma.product.findFirst({ orderBy: { reviewCount: 'desc' }, select: { id: true } });
    if (!top) throw notFound('No products in the catalogue yet');
    productId = top.id;
  }

  const product = await findProductOr404(productId);
  const range = parseRange(queryString(req.query.range));
  const store = queryString(req.query.store);
  const allTime = await seriesFor(product.id, null, undefined, product.bestPrice);
  const stats90 = computeStats(sliceByDays(allTime, 90));
  const window30 = sliceByDays(allTime, 31);

  const [history, prediction] = await Promise.all([getPriceHistory(product.id, range, store), getPricePrediction(product.id)]);

  res.json({
    product: toProductCard(product, allTime),
    stores: ['All Stores', ...product.stores.map((s) => s.store.name)],
    stats: {
      current: Math.round(product.bestPrice ?? 0),
      lowestEver: computeStats(allTime)?.lowest ?? null,
      average90: stats90?.average ?? null,
      highest90: stats90?.highest ?? null,
      change30Percent: window30.length > 1 ? Number(percentChange(window30[0].price, window30[window30.length - 1].price).toFixed(1)) : 0,
    },
    history,
    prediction,
  });
};

export const getAIAssistantChat = async (req: Request, res: Response): Promise<void> => {
  const message = requireString(req.body, 'message', { max: 500 });
  const productIds = queryList(req.body?.productIds);
  res.json(await answer(message, { productIds }));
};
