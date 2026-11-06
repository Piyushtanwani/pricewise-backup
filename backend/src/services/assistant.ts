/**
 * PriceWise AI Shopping Assistant service.
 * Supports primary execution via Google Gemini AI Orchestrator with native function calling,
 * fallback to ML service proxy, and local deterministic catalogue analysis.
 */
import prisma from '../utils/prisma';
import { titleTokens } from './matching';
import { computeTrend, computeVerdict, predictLinear, sliceByDays, percentChange, withCurrentPrice } from './priceAnalytics';
import { ProductCard, ProductWithStores, loadDailySeries, productInclude, toProductCard } from './productService';
import { env } from '../config/env';
import { AIOrchestrator } from './gemini/aiOrchestrator';

export type Intent = 'buy_now' | 'alternatives' | 'compare' | 'recommend' | 'technical_qa' | 'general_shopping';

export interface AssistantReply {
  role: 'assistant';
  content: string;
  products: ProductCard[];
  insights: { label: string; value: string }[];
  parsed: { intent: Intent; budget: number | null; category: string | null };
  suggestedFollowUps?: string[];
  sessionId?: string;
  userId?: string;
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
  const lower = text.toLowerCase();
  if (
    /\b(snapdragon|dimensity|mediatek|exynos|tensor|bionic|amoled|oled|ips|lcd|intel|amd|ryzen|rtx|gtx|ddr4|ddr5|refresh rate|nits|ppi|tdp|vram)\b/i.test(lower) &&
    /\b(vs\.?|versus|difference|compare|better|what is|how to|which|enough)\b/i.test(lower)
  ) {
    return 'technical_qa';
  }
  if (/\b(what is refresh rate|how much ram|is \d+\s*gb ram enough|which processor for)\b/i.test(lower)) {
    return 'technical_qa';
  }
  if (
    /\b(compare|vs\.?|versus|difference between)\b/i.test(text) ||
    (/\bor\b/i.test(text) && /\b(buy|which|better|choose|prefer|pick)\b/i.test(text))
  ) {
    return 'compare';
  }
  if (/\b(cheaper|alternatives?|similar|instead of)\b/i.test(text)) return 'alternatives';
  if (/\b(should i buy|buy now|good time|worth (it|buying)|right time|wait)\b/i.test(text)) return 'buy_now';
  return 'recommend';
};

const findMentioned = (message: string, products: ProductWithStores[]): ProductWithStores[] => {
  // If the query has comparison or choice separators like " or " or " vs ", split into distinct target queries
  let targets = [message];
  if (/\b(?:vs\.?|versus)\b/i.test(message)) {
    targets = message.split(/\b(?:vs\.?|versus)\b/i).map((t) => t.trim());
  } else if (/\bor\b/i.test(message) && /\b(buy|which|better|choose|prefer|pick)\b/i.test(message)) {
    const cleaned = message.replace(/^(?:should i buy|which is better|which one|compare)\s+/i, '').replace(/\?+$/, '');
    targets = cleaned.split(/\bor\b/i).map((t) => t.trim());
  }

  if (targets.length >= 2) {
    const collected: ProductWithStores[] = [];
    for (const t of targets.slice(0, 2)) {
      const words = titleTokens(t);
      const matches = products
        .map((p) => {
          const tokens = titleTokens(p.name, p.brand);
          let shared = 0;
          let modelHit = false;
          for (const tok of tokens) {
            if (words.has(tok)) {
              shared++;
              if (/\d/.test(tok)) modelHit = true;
            }
          }
          const brandHit = words.has(p.brand.toLowerCase());
          return { p, score: shared + (brandHit ? 1 : 0), qualifies: shared >= 2 || (shared >= 1 && (modelHit || brandHit)) };
        })
        .filter((m) => m.qualifies)
        .sort((a, b) => b.score - a.score);

      for (const m of matches.slice(0, 2)) {
        if (!collected.some((x) => x.id === m.p.id)) {
          collected.push(m.p);
        }
      }
    }
    if (collected.length >= 2) return collected;
  }

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
  if (intent === 'buy_now' && mentioned.length === 0 && (category || budget)) intent = 'recommend';
  const parsed = { intent, budget, category };

  const inScope = (p: ProductWithStores) =>
    (!category || p.category.toLowerCase() === category.toLowerCase()) && (!budget || (p.bestPrice ?? Infinity) <= budget);
  const ranked = all
    .filter(inScope)
    .map((p) => ({ p, card: cardOf(p) }))
    .sort((a, b) => valueScore(b.card) - valueScore(a.card));

  const budgetText = budget ? ` under ${inr(budget)}` : '';

  if (intent === 'technical_qa') {
    const lower = message.toLowerCase();
    let content = `### Technical Hardware Guide: ${message}\n\nWhen evaluating technology hardware, prioritize your core workflow:\n• **Gaming & Heavy 3D:** Choose architectures with proven driver stacks (Snapdragon Adreno, NVIDIA RTX) for maximum frame stability.\n• **Efficiency & Battery Life:** Modern TSMC 4nm/3nm fabrication processes run significantly cooler with lower idle drain.\n• **Future-Proofing:** Ensure adequate memory bandwidth and VRAM to prevent performance bottlenecks.`;
    const insights = [
      { label: 'Technical Analysis', value: 'Architectural and real-world performance evaluation' },
      { label: 'Buying Advice', value: 'Match component strengths to your specific daily tasks' },
    ];

    if (/snapdragon.*(?:vs|versus|mediatek|dimensity)|(?:mediatek|dimensity).*(?:vs|versus|snapdragon)/i.test(lower)) {
      content = `### Snapdragon vs MediaTek Dimensity: Comprehensive Comparison\n\n` +
        `Both Qualcomm Snapdragon and MediaTek Dimensity build world-class mobile SoCs on cutting-edge ARM architecture (primarily TSMC 4nm and 3nm nodes), but they differ across several critical performance pillars:\n\n` +
        `**1. CPU Architecture & Sustained Performance:**\n` +
        `• **Snapdragon:** Flagship chips (Snapdragon 8 Elite / 8 Gen 3) utilize Qualcomm's custom Oryon cores and Prime Cortex-X cores, delivering top-tier single-core burst speeds, high UI responsiveness, and balanced sustained thermal performance.\n` +
        `• **Dimensity:** Flagship chips (Dimensity 9400 / 9300) pioneer an 'All-Big-Core' architecture without small efficiency cores. This architecture produces exceptional multi-core throughput and heavy multitasking power while maintaining high energy efficiency.\n\n` +
        `**2. GPU & Gaming Performance:**\n` +
        `• **Snapdragon (Adreno GPU):** Widely recognized as the gold standard for mobile gaming. Qualcomm's Adreno GPUs benefit from extensive game developer optimization, broad emulator support, and custom driver support (Turnip/Mesa). Peak and sustained frame rates in heavy 3D titles (Genshin Impact, BGMI/PUBG) are industry-leading.\n` +
        `• **Dimensity (ARM Immortalis / Mali GPU):** Immortalis-G925 delivers desktop-grade hardware ray tracing and phenomenal raw compute. In mainstream mobile titles, performance is neck-and-neck with Snapdragon, though select niche emulators still prioritize Snapdragon driver stacks.\n\n` +
        `**3. Thermal Efficiency & Battery Life:**\n` +
        `• Both lineups fabricate at TSMC, eliminating older overheating issues.\n` +
        `• **Dimensity** often provides class-leading standby time and power efficiency in mixed daily use and streaming.\n` +
        `• **Snapdragon** demonstrates exceptional power throttling management under prolonged heavy gaming sessions.\n\n` +
        `**4. Camera ISP & AI Compute:**\n` +
        `• **Snapdragon:** Spectra ISP excels in 4K/8K HDR computational video, advanced night mode tuning, and broad compatibility with Google Camera (GCam) ports.\n` +
        `• **Dimensity:** Imagiq ISP pairs with MediaTek's powerful NPU to deliver swift AI scene processing and rich portrait photography with minimal battery drain.\n\n` +
        `**Verdict & Buying Guidance:**\n` +
        `• **Choose Snapdragon** if: You are a competitive gamer, frequently play demanding 3D games or emulators, rely on GCam camera mods, or prefer long-term custom software support.\n` +
        `• **Choose MediaTek Dimensity** if: You seek the best price-to-performance ratio in the mid-range and upper mid-range (Dimensity 7000 / 8000 / 9000 series), superior multi-core power, and outstanding day-to-day battery efficiency.`;
      insights[0] = { label: 'Gaming & Drivers', value: 'Snapdragon Adreno leads in emulator and game developer optimization' };
      insights[1] = { label: 'Value & Multi-Core', value: 'MediaTek Dimensity leads in multi-core throughput and price-to-performance' };
    } else if (/amoled.*(?:vs|versus|oled|lcd|ips)|oled.*(?:vs|versus|amoled|lcd|ips)/i.test(lower)) {
      content = `### AMOLED vs OLED: Display Technology Explained\n\n` +
        `**1. Fundamental Differences:**\n` +
        `• **OLED (Organic Light Emitting Diode):** Individual organic pixels emit their own light, allowing true blacks (infinite contrast ratio) by shutting pixels off completely.\n` +
        `• **AMOLED (Active Matrix OLED):** Adds an Active Matrix Thin-Film Transistor (TFT) backplane, allowing independent, rapid control of every pixel.\n\n` +
        `**2. Practical Advantages of AMOLED:**\n` +
        `• **Faster Refresh Rates & Motion Clarity:** Switches pixel states substantially faster, making 90Hz, 120Hz, and 144Hz displays viable for smartphones and gaming monitors.\n` +
        `• **Higher Power Efficiency:** Consumes significantly less power when displaying dark UI themes or during Always-On Display (AOD).\n` +
        `• **Brighter Outdoor Visibility:** Modern Super AMOLED and Dynamic AMOLED panels reach 2,000+ to 4,500 nits peak brightness.\n\n` +
        `**Verdict:** All modern smartphone 'OLED' screens are technically AMOLED. Choose Super AMOLED / Dynamic AMOLED for the deepest contrast, vibrant HDR color reproduction, and lower battery drain.`;
      insights[0] = { label: 'Contrast Ratio', value: 'Infinite contrast with true pitch blacks' };
      insights[1] = { label: 'Efficiency', value: 'Consumes 0 power for black pixels in Dark Mode' };
    }

    return {
      role: 'assistant',
      content,
      products: [],
      insights,
      parsed: { intent: 'technical_qa', budget: null, category: null },
    };
  }

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
    let picks: ProductCard[] = [];
    if (mentioned.length >= 2) {
      const byBrand = new Map<string, ProductWithStores[]>();
      for (const p of mentioned) {
        const b = p.brand.toLowerCase();
        if (!byBrand.has(b)) byBrand.set(b, []);
        byBrand.get(b)!.push(p);
      }
      if (byBrand.size >= 2) {
        for (const [, prods] of byBrand) {
          picks.push(...prods.slice(0, 2).map(cardOf));
          if (picks.length >= 4) break;
        }
      } else {
        picks = mentioned.slice(0, 3).map(cardOf);
      }
    } else {
      picks = ranked.slice(0, 3).map((r) => r.card);
    }

    if (picks.length >= 2) {
      const distinctBrands = Array.from(new Set(picks.map((p) => p.brand)));
      const cheapest = [...picks].sort((a, b) => a.bestPrice - b.bestPrice)[0];
      const topRated = [...picks].sort((a, b) => b.rating - a.rating)[0];
      const biggestDiscount = [...picks].sort((a, b) => b.discount - a.discount)[0];

      let content = `Here is how ${picks.map((p) => p.name).join(', ')} compare right now:`;
      if (distinctBrands.length >= 2) {
        const b1Prod = picks.find((p) => p.brand === distinctBrands[0]);
        const b2Prod = picks.find((p) => p.brand === distinctBrands[1]);
        content = `Comparing ${distinctBrands.join(' versus ')} across current catalogue offerings:\n\n` +
          `• ${distinctBrands[0]}: Key option includes the ${b1Prod?.name} at ${inr(b1Prod?.bestPrice || 0)}.\n` +
          `• ${distinctBrands[1]}: Key option includes the ${b2Prod?.name} at ${inr(b2Prod?.bestPrice || 0)}.\n\n` +
          `Evaluate each brand according to your priorities in software preference, camera tuning, and performance.`;
      }

      return {
        role: 'assistant',
        content,
        products: picks,
        insights: [
          { label: 'Lowest Price', value: `${cheapest.name} at ${inr(cheapest.bestPrice)}` },
          { label: 'Highest Rated', value: `${topRated.name} (${topRated.rating} / 5)` },
          { label: 'Biggest Discount', value: `${biggestDiscount.name} — ${biggestDiscount.discount}% off MRP` },
          { label: 'Comparison Scope', value: distinctBrands.length >= 2 ? `${distinctBrands.join(' vs ')} (${picks.length} models)` : `${picks.length} models compared` },
        ],
        parsed,
      };
    }
  }

  const noun = category ? category.toLowerCase() : 'products';
  const picks = ranked.slice(0, 3).map((r) => r.card);
  if (picks.length === 0) {
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

export const answer = async (
  message: string,
  context: { productIds?: string[]; userId?: string; sessionId?: string } = {},
): Promise<AssistantReply> => {
  // 1. Primary: Advanced Gemini-Powered AI Shopping Intelligence Agent
  if (env.gemini.apiKey) {
    try {
      const geminiReply = await AIOrchestrator.answer(message, context);
      return geminiReply;
    } catch (err) {
      console.error('[Assistant] Gemini AI Orchestrator error, falling back:', err);
    }
  }

  // 2. Secondary: ML Service proxy if available
  if (env.mlServiceUrl) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${env.mlServiceUrl}/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          product_ids: context.productIds || [],
          user_context: {
            user_id: context.userId,
            session_id: context.sessionId,
          },
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as AssistantReply;
        if (data && data.content && Array.isArray(data.products)) {
          return {
            ...data,
            userId: context.userId,
            sessionId: context.sessionId,
          };
        }
      }
    } catch {
      // Fallback seamlessly to local deterministic engine if ML service is unreachable or times out
    }
  }

  // 3. Fallback: Local deterministic catalogue engine
  const localRes = await localAnswer(message, context);
  return {
    ...localRes,
    userId: context.userId,
    sessionId: context.sessionId,
    source: 'rule-based-fallback',
  };
};
