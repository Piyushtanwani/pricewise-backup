import { env } from '../config/env';
import { Confidence, DailyPoint, Prediction, Recommendation, predictLinear, recommendationFor } from './priceAnalytics';

const ML_TIMEOUT_MS = 3000;

const RECOMMENDATION_MAP: Record<string, Recommendation> = {
  'BUY NOW': 'BUY',
  BUY: 'BUY',
  WAIT: 'WAIT',
  MONITOR: 'MONITOR',
};

const CONFIDENCE_VALUES: Confidence[] = ['High', 'Moderate', 'Low'];

/**
 * Uses the FastAPI ML service (ml-service/) when ML_SERVICE_URL is set, falling back to the
 * built-in linear trend when it is unset, unreachable, or there is too little history.
 * The ML service returns a single price, which is treated as the 30-day forecast.
 */
export const predictPrices = async (productId: string, series: DailyPoint[]): Promise<Prediction> => {
  const local = predictLinear(series);
  if (!env.mlServiceUrl || local.insufficientData) return local;

  try {
    const res = await fetch(`${env.mlServiceUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId, historical_prices: series.slice(-90).map((p) => p.price) }),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`ML service responded ${res.status}`);
    const body = (await res.json()) as { predicted_price?: number; recommendation?: string; confidence?: string };
    if (typeof body.predicted_price !== 'number' || !Number.isFinite(body.predicted_price)) {
      throw new Error('ML service returned no predicted_price');
    }

    const predicted30d = Math.round(body.predicted_price);
    const current = local.points[0].price ?? predicted30d;
    const last = local.points[local.points.length - 1];
    const shift = predicted30d - last.predicted;
    const points = local.points.map((p, i) =>
      i === local.points.length - 1
        ? { ...p, predicted: predicted30d, upper: p.upper + shift, lower: Math.max(0, p.lower + shift) }
        : p,
    );
    const confidence = CONFIDENCE_VALUES.find((c) => c === body.confidence) ?? local.confidence;

    return {
      ...local,
      points,
      predicted30d,
      potentialSaving: Math.max(0, current - Math.min(local.predicted7d, predicted30d)),
      recommendation: RECOMMENDATION_MAP[body.recommendation?.toUpperCase() ?? ''] ?? recommendationFor(current, predicted30d),
      confidence,
      source: 'ml-service',
    };
  } catch (err) {
    console.warn(`ML service unavailable, using local trend model: ${err instanceof Error ? err.message : err}`);
    return local;
  }
};
