/**
 * Pure price-analysis helpers. Inputs are daily best-price series (one point per UTC day,
 * ascending), so everything here is deterministic and unit-testable without a database.
 */

export interface DailyPoint {
  day: Date; // UTC midnight
  price: number;
}

export type Trend = 'up' | 'down' | 'stable';
export type VerdictColor = 'green' | 'amber' | 'blue';
export type Recommendation = 'BUY' | 'WAIT' | 'MONITOR';
export type Confidence = 'High' | 'Moderate' | 'Low';

export interface PriceStats {
  lowest: number;
  highest: number;
  average: number;
  current: number;
}

export interface Verdict {
  label: string;
  color: VerdictColor;
  recommendation: Recommendation;
  confidence: Confidence;
  explanation: string;
}

export interface Insight {
  type: 'check' | 'warn';
  text: string;
}

export interface PredictionPoint {
  date: string;
  timestamp: string;
  price: number | null;
  predicted: number;
  upper: number;
  lower: number;
}

export interface Prediction {
  points: PredictionPoint[];
  predicted7d: number;
  predicted30d: number;
  potentialSaving: number;
  confidence: Confidence;
  recommendation: Recommendation;
  explanation?: string;
  trend?: string;
  insufficientData: boolean;
  source: 'local-trend' | 'ml-service';
  disclaimer: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_POINTS_FOR_VERDICT = 7;
const MIN_POINTS_FOR_PREDICTION = 14;

export const PREDICTION_DISCLAIMER =
  'Price predictions are estimates based on historical patterns. Actual prices may vary.';

export const RANGE_DAYS = {
  '7D': 7,
  '30D': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  All: null,
} as const;

export type RangeKey = keyof typeof RANGE_DAYS;

export const parseRange = (value: string | undefined, fallback: RangeKey = '3M'): RangeKey =>
  value && value in RANGE_DAYS ? (value as RangeKey) : fallback;

export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const formatDayLabel = (day: Date): string =>
  day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const round = (n: number): number => Math.round(n);

const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;

/** Makes sure the latest point reflects the live best price, which is authoritative over history. */
export const withCurrentPrice = (series: DailyPoint[], currentPrice: number | null | undefined, now = new Date()): DailyPoint[] => {
  if (currentPrice === null || currentPrice === undefined) return series;
  const today = startOfUtcDay(now);
  const last = series[series.length - 1];
  if (last && last.day.getTime() === today.getTime()) {
    return [...series.slice(0, -1), { day: today, price: currentPrice }];
  }
  return [...series, { day: today, price: currentPrice }];
};

/** Points within the last `days` days of the series (inclusive of the latest day). */
export const sliceByDays = <T extends DailyPoint>(series: T[], days: number | null): T[] => {
  if (days === null || series.length === 0) return series;
  const cutoff = series[series.length - 1].day.getTime() - (days - 1) * DAY_MS;
  return series.filter((p) => p.day.getTime() >= cutoff);
};

export const computeStats = (series: DailyPoint[]): PriceStats | null => {
  if (series.length === 0) return null;
  const prices = series.map((p) => p.price);
  return {
    lowest: round(Math.min(...prices)),
    highest: round(Math.max(...prices)),
    average: round(mean(prices)),
    current: round(prices[prices.length - 1]),
  };
};

export const trailingAverage = (series: DailyPoint[], window = 30): number[] => {
  const out: number[] = [];
  let sum = 0;
  series.forEach((point, i) => {
    sum += point.price;
    if (i >= window) sum -= series[i - window].price;
    out.push(round(sum / Math.min(i + 1, window)));
  });
  return out;
};

/** Evenly samples at most `maxPoints` points, always keeping the first and last. */
export const downsample = <T>(items: T[], maxPoints: number): T[] => {
  if (items.length <= maxPoints || maxPoints < 2) return items;
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(items[Math.round((i * (items.length - 1)) / (maxPoints - 1))]);
  }
  return out;
};

export const percentChange = (from: number, to: number): number => (from === 0 ? 0 : ((to - from) / from) * 100);

/** Compares the current price with the price roughly `lookbackDays` ago; moves under 2% count as stable. */
export const computeTrend = (series: DailyPoint[], lookbackDays = 30): Trend => {
  const window = sliceByDays(series, lookbackDays + 1);
  if (window.length < 2) return 'stable';
  const change = percentChange(window[0].price, window[window.length - 1].price);
  if (change <= -2) return 'down';
  if (change >= 2) return 'up';
  return 'stable';
};

/** The 7-value mini history shown on product cards, sampled over the last 90 days. */
export const sparkline = (series: DailyPoint[], points = 7, days = 90): number[] =>
  downsample(sliceByDays(series, days), points).map((p) => round(p.price));

const confidenceFor = (pointCount: number): Confidence => {
  if (pointCount >= 60) return 'High';
  if (pointCount >= 21) return 'Moderate';
  return 'Low';
};

const inr = (n: number): string => '₹' + round(n).toLocaleString('en-IN');

export const computeVerdict = (series: DailyPoint[]): Verdict => {
  const window90 = sliceByDays(series, 90);
  if (window90.length < MIN_POINTS_FOR_VERDICT) {
    return {
      label: 'Monitor price',
      color: 'blue',
      recommendation: 'MONITOR',
      confidence: 'Low',
      explanation: 'Not enough price history yet to judge this price. Track it to build a trend.',
    };
  }

  const stats = computeStats(window90)!;
  const belowAvg = (stats.average - stats.current) / stats.average;
  const confidence = confidenceFor(window90.length);
  const relation =
    Math.abs(belowAvg) < 0.005
      ? `Current price is in line with its 90-day average of ${inr(stats.average)}.`
      : `Current price is ${Math.abs(belowAvg * 100).toFixed(0)}% ${belowAvg > 0 ? 'below' : 'above'} its 90-day average of ${inr(stats.average)}.`;

  // Uses the same forecast rule as predictLinear(), so a WAIT forecast never sits next to a BUY verdict.
  const forecast = predictLinear(series);
  const forecastSignal = forecast.insufficientData ? 'MONITOR' : forecast.recommendation;

  if (forecastSignal === 'WAIT') {
    return {
      label: 'Wait for better deal',
      color: 'amber',
      recommendation: 'WAIT',
      confidence,
      explanation: `${relation} The price is still falling and is expected to reach about ${inr(forecast.predicted30d)} within 30 days.`,
    };
  }
  if (belowAvg >= 0.15) {
    return { label: 'Excellent deal', color: 'green', recommendation: 'BUY', confidence, explanation: relation };
  }
  if (belowAvg >= 0.03 || stats.current <= stats.lowest * 1.02) {
    return { label: 'Good time to buy', color: 'green', recommendation: 'BUY', confidence, explanation: relation };
  }
  // Above-average prices stay on MONITOR even when rising: the forecast alone is not a reason to overpay.
  return {
    label: 'Monitor price',
    color: 'amber',
    recommendation: 'MONITOR',
    confidence,
    explanation: forecastSignal === 'BUY' ? `${relation} Prices are trending upward, so it may not get cheaper soon.` : relation,
  };
};

export const buildInsights = (series: DailyPoint[]): Insight[] => {
  const window90 = sliceByDays(series, 90);
  if (window90.length < MIN_POINTS_FOR_VERDICT) {
    return [{ type: 'warn', text: 'Limited price history is available, so these insights are preliminary.' }];
  }
  const stats90 = computeStats(window90)!;
  const insights: Insight[] = [];

  const vsAvg = percentChange(stats90.average, stats90.current);
  insights.push(
    vsAvg <= 0
      ? { type: 'check', text: `Current price is ${Math.abs(vsAvg).toFixed(0)}% below the 90-day average` }
      : { type: 'warn', text: `Current price is ${vsAvg.toFixed(0)}% above the 90-day average` },
  );

  const window30 = sliceByDays(series, 31);
  const change30 = percentChange(window30[0].price, window30[window30.length - 1].price);
  if (Math.abs(change30) >= 1) {
    insights.push(
      change30 < 0
        ? { type: 'check', text: `Price has dropped ${Math.abs(change30).toFixed(0)}% in the last 30 days` }
        : { type: 'warn', text: `Price has risen ${change30.toFixed(0)}% in the last 30 days` },
    );
  }

  const prices = window90.map((p) => p.price);
  const avg = mean(prices);
  const cv = Math.sqrt(mean(prices.map((p) => (p - avg) ** 2))) / avg;
  if (cv > 0.08) insights.push({ type: 'warn', text: 'Price volatility is high — expect frequent swings' });
  else if (cv > 0.03) insights.push({ type: 'warn', text: 'Price volatility is moderate — sudden increases are possible' });
  else insights.push({ type: 'check', text: 'Price has been stable over the last 90 days' });

  const stats180 = computeStats(sliceByDays(series, 180))!;
  if (stats180.current <= stats180.lowest * 1.01) {
    insights.push({ type: 'check', text: 'This is one of the lowest prices recorded in the last 6 months' });
  } else if (stats90.current >= stats90.highest * 0.99) {
    insights.push({ type: 'warn', text: 'Price is near its 90-day high' });
  }

  return insights;
};

const recommendationFor = (current: number, predicted30d: number): Recommendation => {
  if (predicted30d < current * 0.97) return 'WAIT';
  if (predicted30d > current * 1.03) return 'BUY';
  return 'MONITOR';
};

const TREND_WINDOW_DAYS = 45;
// Damping factor for the trend: each extra day ahead carries 95% of the previous day's slope,
// so a 30-day projection moves ~15 days' worth of slope instead of 30. Plain linear
// extrapolation overshoots when a price decline is levelling off.
const DAMPING = 0.95;
const dampedDays = (h: number) => (DAMPING * (1 - DAMPING ** h)) / (1 - DAMPING);

/**
 * Damped linear trend: least-squares slope over the last 45 days, applied from the current
 * price with damping, projected 7/14/30 days ahead with a band that widens with the horizon.
 * A baseline used when the ML service is not configured or unavailable.
 */
export const predictLinear = (series: DailyPoint[], horizons = [7, 14, 30]): Prediction => {
  const window = sliceByDays(series, TREND_WINDOW_DAYS);
  const last = series[series.length - 1];
  const current = last ? round(last.price) : 0;
  const lastDay = last ? last.day : startOfUtcDay(new Date());
  const anchor: PredictionPoint = {
    date: formatDayLabel(lastDay),
    timestamp: lastDay.toISOString(),
    price: current,
    predicted: current,
    upper: current,
    lower: current,
  };

  if (window.length < MIN_POINTS_FOR_PREDICTION) {
    return {
      points: [anchor],
      predicted7d: current,
      predicted30d: current,
      potentialSaving: 0,
      confidence: 'Low',
      recommendation: 'MONITOR',
      insufficientData: true,
      source: 'local-trend',
      disclaimer: PREDICTION_DISCLAIMER,
    };
  }

  const origin = window[0].day.getTime();
  const xs = window.map((p) => (p.day.getTime() - origin) / DAY_MS);
  const ys = window.map((p) => p.price);
  const xMean = mean(xs);
  const yMean = mean(ys);
  const sxx = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const slope = sxx === 0 ? 0 : xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0) / sxx;
  const intercept = yMean - slope * xMean;
  const residuals = ys.map((y, i) => y - (intercept + slope * xs[i]));
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  const residStd = Math.sqrt(ssRes / Math.max(1, window.length - 2));

  const project = (h: number) => {
    const raw = current + slope * dampedDays(h);
    const predicted = round(Math.min(current * 1.5, Math.max(current * 0.5, raw)));
    const band = 1.96 * residStd * Math.sqrt(1 + h / window.length) + current * 0.005 * Math.sqrt(h);
    return { predicted, upper: round(predicted + band), lower: round(Math.max(0, predicted - band)) };
  };

  const points = [
    anchor,
    ...horizons.map((h) => {
      const day = new Date(lastDay.getTime() + h * DAY_MS);
      return { date: formatDayLabel(day), timestamp: day.toISOString(), price: null, ...project(h) };
    }),
  ];

  const predicted7d = project(7).predicted;
  const predicted30d = project(30).predicted;
  const confidence: Confidence = r2 >= 0.6 && window.length >= 40 ? 'High' : r2 >= 0.3 ? 'Moderate' : 'Low';

  return {
    points,
    predicted7d,
    predicted30d,
    potentialSaving: Math.max(0, current - Math.min(predicted7d, predicted30d)),
    confidence,
    recommendation: recommendationFor(current, predicted30d),
    insufficientData: false,
    source: 'local-trend',
    disclaimer: PREDICTION_DISCLAIMER,
  };
};

export { recommendationFor };
