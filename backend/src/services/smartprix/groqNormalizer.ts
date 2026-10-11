import { env } from '../../config/env';

export interface NormalizedProductSchema {
  name: string;
  brand: string;
  category: string;
  imageUrl?: string | null;
  mrp?: number | null;
  bestPrice?: number | null;
  discountPercent?: number | null;
  rating?: number | null;
  specs: string[];
  techSpecs: Record<string, string>;
  stores: {
    store: string;
    currentPrice: number | null;
    mrp?: number | null;
    productUrl?: string;
    inStock: boolean;
  }[];
}

export class GroqNormalizerError extends Error {
  constructor(message: string, public readonly statusCode = 500) {
    super(`[Groq Normalizer] ${message}`);
    this.name = 'GroqNormalizerError';
  }
}

export class GroqNormalizer {
  public isConfigured(): boolean {
    return Boolean(env.groq.apiKey && env.groq.apiKey.trim() !== '');
  }

  public async normalizeWithGroq(rawData: unknown): Promise<{
    normalized: NormalizedProductSchema[] | NormalizedProductSchema;
    model: string;
    usage?: unknown;
  }> {
    const apiKey = env.groq.apiKey;
    if (!apiKey || apiKey.trim() === '') {
      throw new GroqNormalizerError('GROQ_API_KEY is not configured in backend/.env', 401);
    }

    const systemPrompt = `You are an expert product data transformer for PriceWise, a price comparison and market intelligence platform.
Your task is to transform raw product data scraped from Smartprix (via Parse.bot) into the exact PriceWise JSON schema.

Schema requirements:
{
  "products": [
    {
      "name": "Full product title (string)",
      "brand": "Brand name (string)",
      "category": "Mobiles (or Laptops/Tablets)",
      "imageUrl": "Product image URL if present or null",
      "mrp": "Maximum retail price as number or null",
      "bestPrice": "Best/lowest price as number or null",
      "discountPercent": "Calculated discount percentage as number or null",
      "rating": "Rating out of 5 as number or 0",
      "specs": ["Array of concise highlight strings, e.g. '12 GB RAM', '256 GB Storage', '5000 mAh'"],
      "techSpecs": {
        "Key": "Value pairs of technical specifications (Display, Processor, Battery, Camera, OS, etc.)"
      },
      "stores": [
        {
          "store": "Retailer name (Amazon, Flipkart, Croma, Samsung, etc.)",
          "currentPrice": "Store price as number or null",
          "mrp": "Store MRP as number or null",
          "productUrl": "Store URL if available",
          "inStock": true
        }
      ]
    }
  ]
}

Return ONLY valid JSON matching this schema. Clean up currency symbols (e.g. convert '₹1,24,999' into 124999).`;

    const userPrompt = `Here is the raw data from Parse.bot Smartprix:
${JSON.stringify(rawData, null, 2).slice(0, 30_000)}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.groq.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new GroqNormalizerError(`Groq API returned HTTP ${response.status}: ${errText}`, response.status);
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new GroqNormalizerError('Groq returned empty response content');
    }

    const parsed = JSON.parse(content);
    return {
      normalized: parsed.products ?? parsed,
      model: payload.model ?? env.groq.model,
      usage: payload.usage,
    };
  }
}

export const groqNormalizer = new GroqNormalizer();
