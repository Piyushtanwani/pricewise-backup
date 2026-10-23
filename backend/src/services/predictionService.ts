import { env } from '../config/env';
import {
  Confidence,
  DailyPoint,
  Prediction,
  PredictionPoint,
  Recommendation,
  predictLinear,
  recommendationFor,
  PREDICTION_DISCLAIMER,
} from './priceAnalytics';

const ML_TIMEOUT_MS = 3500;

const RECOMMENDATION_MAP: Record<string, Recommendation> = {
  'BUY NOW': 'BUY',
  BUY: 'BUY',
  WAIT: 'WAIT',
  MONITOR: 'MONITOR',
};

const CONFIDENCE_VALUES: Confidence[] = ['High', 'Moderate', 'Low'];

interface MlForecastPoint {
  date: string;
  price?: number | null;
  predicted: number;
  upper: number;
  lower: number;
}

interface MlPredictResponse {
  product_id?: string;
  status?: string;
  model_version?: string;
  forecast_timestamp?: string;
  predicted_price?: number;
  predicted_7d?: number;
  predicted_14d?: number;
  predicted_30d?: number;
  trend?: string;
  recommendation?: string;
  confidence?: string;
  potential_saving?: number;
  explanation?: string;
  points?: MlForecastPoint[];
  source?: string;
}

/**
 * Predicts future prices by calling the FastAPI ML service (ml-service/).
 * Falls back deterministically to the local mathematical regression model when
 * the ML service is unset, unreachable, or returns an error.
 */
export const predictPrices = async (
  productId: string,
  series: DailyPoint[],
  currentPrice?: number | null,
  storeId?: string
): Promise<Prediction> => {
  const local = predictLinear(series);
  if (!env.mlServiceUrl) {
    const localExp = local.recommendation === 'BUY'
      ? `Price is projected to rise towards ₹${local.predicted30d.toLocaleString('en-IN')} within 30 days. Current price is favorable.`
      : local.recommendation === 'WAIT'
      ? `Price is expected to drop towards ₹${local.predicted30d.toLocaleString('en-IN')} within 30 days. Recommend waiting for upcoming drops.`
      : `Price is stable near ₹${local.predicted30d.toLocaleString('en-IN')}. Monitor for promotional retailer sales.`;
    return {
      ...local,
      explanation: localExp,
    };
  }

  const payload = {
    product_id: productId,
    historical_prices: series.slice(-90).map((p) => p.price),
    current_price: currentPrice ?? local.points[0]?.price ?? undefined,
    store_id: storeId,
  };

  try {
    // Attempt request with bounded timeout
    let res: globalThis.Response;
    try {
      res = await fetch(`${env.mlServiceUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ML_TIMEOUT_MS),
      });
    } catch (networkErr: any) {
      // Single bounded retry on transient connection resets
      res = await fetch(`${env.mlServiceUrl}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ML_TIMEOUT_MS),
      });
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as MlPredictResponse;

    const predicted30d = Math.round(body.predicted_30d ?? body.predicted_price ?? local.predicted30d);
    const predicted7d = Math.round(body.predicted_7d ?? local.predicted7d);
    const potentialSaving = Math.round(body.potential_saving ?? Math.max(0, (local.points[0]?.price ?? predicted30d) - Math.min(predicted7d, predicted30d)));
    const recommendation = RECOMMENDATION_MAP[body.recommendation?.toUpperCase() ?? ''] ?? recommendationFor(local.points[0]?.price ?? predicted30d, predicted30d);
    const confidence = CONFIDENCE_VALUES.find((c) => c === body.confidence) ?? local.confidence;

    // Use ML service points with uncertainty bounds if provided
    let points: PredictionPoint[] = local.points;
    if (Array.isArray(body.points) && body.points.length >= 3) {
      points = body.points.map((p) => ({
        date: p.date,
        timestamp: p.date,
        price: typeof p.price === 'number' ? Math.round(p.price) : null,
        predicted: Math.round(p.predicted),
        upper: Math.round(p.upper),
        lower: Math.round(Math.max(0, p.lower)),
      }));
    }

    const explanation = body.explanation || (
      recommendation === 'BUY'
        ? `PriceWise ML model forecasts a favorable buying window with prices projected near ₹${predicted30d.toLocaleString('en-IN')}.`
        : recommendation === 'WAIT'
        ? `PriceWise ML model projects prices softening to ₹${predicted30d.toLocaleString('en-IN')} with potential savings of ₹${potentialSaving.toLocaleString('en-IN')}.`
        : `PriceWise ML model projects stable pricing near ₹${predicted30d.toLocaleString('en-IN')}. Monitor for flash retailer discounts.`
    );

    return {
      points,
      predicted7d,
      predicted30d,
      potentialSaving,
      confidence,
      recommendation,
      explanation,
      trend: body.trend,
      insufficientData: body.status === 'insufficient_data',
      source: 'ml-service',
      disclaimer: PREDICTION_DISCLAIMER,
    };
  } catch (err: any) {
    console.warn(`[PredictionService] ML service unavailable at ${env.mlServiceUrl}: ${err?.message || err}. Falling back to local deterministic model.`);
    const localExp = local.recommendation === 'BUY'
      ? `Price is projected to rise towards ₹${local.predicted30d.toLocaleString('en-IN')} within 30 days. Current price is favorable.`
      : local.recommendation === 'WAIT'
      ? `Price is expected to drop towards ₹${local.predicted30d.toLocaleString('en-IN')} within 30 days. Recommend waiting for upcoming drops.`
      : `Price is stable near ₹${local.predicted30d.toLocaleString('en-IN')}. Monitor for promotional retailer sales.`;

    return {
      ...local,
      explanation: localExp,
      source: 'local-trend',
    };
  }
};
