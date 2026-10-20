/**
 * Rule-based shopping assistant behind POST /api/intelligence/ai. It parses budget, category,
 * intent and product mentions from the message and answers from live catalogue data. It does
 * not call an LLM; the response shape matches the Message type in frontend/src/pages/AIAssistant.tsx.
 */
import prisma from '../utils/prisma';
import { titleTokens } from './matching';
import { computeTrend, computeVerdict, predictLinear, sliceByDays, percentChange, withCurrentPrice } from './priceAnalytics';
import { ProductCard, ProductWithStores, loadDailySeries, productInclude, toProductCard } from './productService';

import { env } from '../config/env';

export type Intent = 'buy_now' | 'alternatives' | 'compare' | 'recommend';

export interface AssistantReply {
  role: 'assistant';
  content: string;
  products: ProductCard[];
  insights: { label: string; value: string }[];
  parsed: { intent: Intent; budget: number | null; category: string | null };
  source?: string;
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = '\\s*(k|thousand|lakhs?|lacs?|l)?(?![a-z])';
const BUDGET_PATTERNS = [
  new RegExp(`(?:under|below|less than|within|up ?to|budget(?: of)?|around|max(?:imum)?)\\s*(?:₹|rs\\.?|inr)?\\s*${NUM}${UNIT}`, 'i'),
  new RegExp(`(?:₹|rs\\.?\\s?|inr\\s)\\s*${NUM}${UNIT}`, 'i'),
  new RegExp(`${NUM}\\s*(k|lakhs?|lacs?)(?![a-z])`, 'i'),
];

const unitMultiplier = (unit: string | undefined): number => {
  if (!unit) return 1;
  const u = unit.toLowerCase();
  if (u === 'k' || u === 'thousand') return 1_000;
  return 100_000; // lakh / lac / l
};

/** "under ₹70K" → 70000, "below 1.5 lakh" → 150000, "₹1,00,000" → 100000. */
export const parseBudget = (text: string): number | null => {
  const normalised = text.replace(/(\d),(?=\d)/g, '$1');
  for (const pattern of BUDGET_PATTERNS) {
    const match = normalised.match(pattern);
    if (match) {
      const value = Number(match[1]) * unitMultiplier(match[2]);
      if (Number.isFinite(value) && value >= 500) return Math.round(value);
    }
  }
  return null;
};

const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ['Laptops', /\b(laptops?|notebooks?|macbooks?|ultrabooks?)\b/i],
  ['Headphones', /\b(headphones?|earphones?|earbuds?|headsets?|tws|airpods)\b/i],
  ['Mobiles', /\b(phones?|mobiles?|smartphones?|iphones?|android)\b/i],
  ['Televisions', /\b(tvs?|televisions?)\b/i],
  ['Cameras', /\b(cameras?|dslr|mirrorless)\b/i],
  ['Smartwatches', /\b(smart ?watch(es)?|watch(es)?|wearables?)\b/i],
  ['Gaming', /\b(gaming|consoles?|playstation|ps5|xbox)\b/i],
  ['Appliances', /\b(appliances?|fridges?|refrigerators?|washing machines?|air conditioners?)\b/i],
];

/** Maps keywords to a canonical category, then to the matching catalogue category name if one exists. */
export const detectCategory = (text: string, known: string[] = []): string | null => {
  const direct = known.find((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
  if (direct) return direct;
  const hit = CATEGORY_KEYWORDS.find(([, re]) => re.test(text));
  if (!hit) return null;
  return known.find((c) => c.toLowerCase() === hit[0].toLowerCase()) ?? hit[0];
};

export const detectIntent = (text: string): Intent => {
  if (/\b(compare|vs\.?|versus|difference between)\b/i.test(text)) return 'compare';
  if (/\b(cheaper|alternatives?|similar|instead of)\b/i.test(text)) return 'alternatives';
  if (/\b(should i buy|buy now|good time|worth (it|buying)|right time|wait)\b/i.test(text)) return 'buy_now';
  return 'recommend';
};

const findMentioned = (message: string, products: ProductWithStores[]): ProductWithStores[] => {
  const words = titleTokens(message);
  return products
    .map((p) => {
      const tokens = titleTokens(p.name, p.brand);
      let shared = 0;
      let modelHit = false;
      for (const t of tokens) {
        if (words.has(t)) {
          shared++;
          if (/\d/.test(t)) modelHit = true;
        }
      }
      const brandHit = words.has(p.brand.toLowerCase());
      return { p, score: shared + (brandHit ? 1 : 0), qualifies: shared >= 2 || (shared >= 1 && (modelHit || brandHit)) };
    })
    .filter((m) => m.qualifies)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.p);
};

const valueScore = (c: ProductCard) =>
  c.rating * 2 + c.discount / 10 + (c.verdictColor === 'green' ? 1 : 0) + Math.log10(c.reviews + 1) / 2;

const trendText = (trend: string, change30: number) =>
  trend === 'down'
    ? `Down ${Math.abs(change30).toFixed(0)}% over the last 30 days`
    : trend === 'up'
      ? `Up ${change30.toFixed(0)}% over the last 30 days`
      : 'Stable over the last 30 days';

const localAnswer = async (message: string, context: { productIds?: string[] } = {}): Promise<AssistantReply> => {
  const categories = (await prisma.product.findMany({ select: { category: true }, distinct: ['category'] })).map((c) => c.category);
  const budget = parseBudget(message);
  const category = detectCategory(message, categories);
  let intent = detectIntent(message);

  const all = await prisma.product.findMany({ include: productInclude, take: 500, orderBy: { reviewCount: 'desc' } });
  const seriesMap = await loadDailySeries(all.map((p) => p.id), { days: 120 });
  const cardOf = (p: ProductWithStores) => toProductCard(p, seriesMap.get(p.id));
  const seriesOf = (p: ProductWithStores) => withCurrentPrice(seriesMap.get(p.id) ?? [], p.bestPrice);

  const contextProducts = context.productIds?.length ? all.filter((p) => context.productIds!.includes(p.id)) : [];
  const mentioned = [...findMentioned(message, all), ...contextProducts];
  // "Which laptop should I buy under ₹1,00,000?" asks for picks, not a verdict on one product.
  if (intent === 'buy_now' && mentioned.length === 0 && (category || budget)) intent = 'recommend';
  const parsed = { intent, budget, category };

  const inScope = (p: ProductWithStores) =>
    (!category || p.category.toLowerCase() === category.toLowerCase()) && (!budget || (p.bestPrice ?? Infinity) <= budget);
  const ranked = all
    .filter(inScope)
    .map((p) => ({ p, card: cardOf(p) }))
    .sort((a, b) => valueScore(b.card) - valueScore(a.card));

  const budgetText = budget ? ` under ${inr(budget)}` : '';

  if (intent === 'buy_now' || (intent === 'recommend' && mentioned.length === 1 && !category && !budget)) {
    const target = mentioned[0] ?? ranked[0]?.p;
    if (target) {
      const card = cardOf(target);
      const series = seriesOf(target);
      const verdict = computeVerdict(series);
      const prediction = predictLinear(series);
      const window30 = sliceByDays(series, 31);
      const change30 = window30.length > 1 ? percentChange(window30[0].price, window30[window30.length - 1].price) : 0;
      return {
        role: 'assistant',
        content: `Looking at current pricing and trends for the ${target.brand} ${target.name}:`,
        products: [card],
        insights: [
          { label: 'Current Price', value: `${inr(card.bestPrice)} at ${card.bestStore}${card.discount ? ` — ${card.discount}% below MRP` : ''}` },
          { label: 'Price Trend', value: trendText(computeTrend(series), change30) },
          {
            label: 'Prediction',
            value: prediction.insufficientData
              ? 'Not enough history for a reliable forecast yet'
              : `${inr(prediction.predicted30d)} expected in 30 days (${prediction.confidence.toLowerCase()} confidence)`,
          },
          { label: 'Verdict', value: `${verdict.label}. ${verdict.explanation}` },
        ],
        parsed,
      };
    }
  }

  if (intent === 'alternatives') {
    const base = mentioned[0] ?? ranked[0]?.p;
    if (base) {
      const baseCard = cardOf(base);
      const alternatives = all
        .filter((p) => p.id !== base.id && p.category === base.category && (p.bestPrice ?? Infinity) < baseCard.bestPrice)
        .filter((p) => !budget || (p.bestPrice ?? Infinity) <= budget)
        .map(cardOf)
        .sort((a, b) => valueScore(b) - valueScore(a))
        .slice(0, 3);
      if (alternatives.length) {
        const top = alternatives[0];
        const cheaperBy = baseCard.bestPrice - top.bestPrice;
        return {
          role: 'assistant',
          content: `Here are cheaper alternatives to the ${base.name} that still offer good value:`,
          products: alternatives,
          insights: [
            { label: 'Alternative', value: `${top.brand} ${top.name} — ${inr(top.bestPrice)}` },
            { label: 'Why it is better', value: `${inr(cheaperBy)} cheaper, rated ${top.rating} / 5 by ${top.reviews.toLocaleString('en-IN')} buyers` },
            {
              label: 'Trade-off',
              value: top.rating < baseCard.rating ? `Slightly lower rating than the original (${baseCard.rating} / 5)` : 'Comparable or better rating at a lower price',
            },
            { label: 'Verdict', value: top.aiVerdict },
          ],
          parsed,
        };
      }
      return {
        role: 'assistant',
        content: `The ${base.name} is already the lowest-priced option in ${base.category} that I track.`,
        products: [baseCard],
        insights: [{ label: 'Verdict', value: baseCard.aiVerdict }],
        parsed,
      };
    }
  }

  if (intent === 'compare') {
    const picks = (mentioned.length >= 2 ? mentioned.map(cardOf) : ranked.map((r) => r.card)).slice(0, 3);
    if (picks.length >= 2) {
      const cheapest = [...picks].sort((a, b) => a.bestPrice - b.bestPrice)[0];
      const topRated = [...picks].sort((a, b) => b.rating - a.rating)[0];
      const biggestDiscount = [...picks].sort((a, b) => b.discount - a.discount)[0];
      const bestValue = [...picks].sort((a, b) => valueScore(b) - valueScore(a))[0];
      return {
        role: 'assistant',
        content: `Here is how ${picks.map((p) => p.name).join(', ')} compare right now:`,
        products: picks,
        insights: [
          { label: 'Lowest Price', value: `${cheapest.name} at ${inr(cheapest.bestPrice)}` },
          { label: 'Highest Rated', value: `${topRated.name} (${topRated.rating} / 5)` },
          { label: 'Biggest Discount', value: `${biggestDiscount.name} — ${biggestDiscount.discount}% off MRP` },
          { label: 'Verdict', value: `${bestValue.name} offers the best overall value` },
        ],
        parsed,
      };
    }
  }

  const noun = category ? category.toLowerCase() : 'products';
  const picks = ranked.slice(0, 3).map((r) => r.card);
  if (picks.length === 0) {
    // Nothing fits the budget: offer the cheapest option in the category instead of a dead end.
    const closest = all
      .filter((p) => (!category || p.category.toLowerCase() === category.toLowerCase()) && p.bestPrice !== null)
      .sort((a, b) => (a.bestPrice ?? 0) - (b.bestPrice ?? 0))[0];
    if (closest && budget) {
      const card = cardOf(closest);
      return {
        role: 'assistant',
        content: `I could not find any ${noun}${budgetText} yet. The most affordable option I track is ${card.brand} ${card.name}:`,
        products: [card],
        insights: [
          { label: 'Closest Option', value: `${inr(card.bestPrice)} at ${card.bestStore} — ${inr(card.bestPrice - budget)} over your budget` },
          { label: 'Verdict', value: card.aiVerdict },
        ],
        parsed,
      };
    }
    return {
      role: 'assistant',
      content: `I could not find any ${noun}${budgetText} yet. Try a higher budget or a different category.`,
      products: [],
      insights: [],
      parsed,
    };
  }
  const best = picks[0];
  return {
    role: 'assistant',
    content: `Based on current pricing and historical trends, here are my top picks${category ? ` for ${noun}` : ''}${budgetText}:`,
    products: picks,
    insights: [
      { label: 'Best Overall', value: `${best.brand} ${best.name} — rated ${best.rating} / 5 at ${inr(best.bestPrice)}` },
      { label: 'Price Trend', value: best.discount ? `Currently ${best.discount}% below MRP` : 'Selling at MRP' },
      { label: 'Best Store', value: `${best.bestStore}, compared across ${best.stores} stores` },
      { label: 'Verdict', value: best.aiVerdict },
    ],
    parsed,
  };
};

export const answer = async (message: string, context: { productIds?: string[] } = {}): Promise<AssistantReply> => {
  if (env.mlServiceUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(`${env.mlServiceUrl}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, product_ids: context.productIds || [] }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as AssistantReply;
        if (data && data.content && Array.isArray(data.products)) {
          return data;
        }
      }
    } catch {
      // Fallback seamlessly to local deterministic engine if ML service is unreachable or times out
    }
  }

  const localRes = await localAnswer(message, context);
  return { ...localRes, source: 'rule-based-fallback' };
};
