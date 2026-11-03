import { z } from 'zod';
import prisma from '../../utils/prisma';
import { ProductCard, loadDailySeries, productInclude, toProductCard } from '../productService';

export const InsightSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const AssistantReplySchema = z.object({
  role: z.literal('assistant'),
  content: z.string(),
  products: z.array(z.any()),
  insights: z.array(InsightSchema),
  parsed: z.object({
    intent: z.enum(['buy_now', 'alternatives', 'compare', 'recommend', 'technical_qa', 'general_shopping']),
    budget: z.number().nullable(),
    category: z.string().nullable(),
  }),
  suggestedFollowUps: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  source: z.string().optional(),
});

export type ValidatedAssistantReply = z.infer<typeof AssistantReplySchema>;

export class ResponseFormatter {
  /**
   * Resolves raw product IDs or objects collected during tool execution into complete, rich ProductCards.
   */
  static async resolveProductCards(productIds: string[]): Promise<ProductCard[]> {
    if (!productIds || productIds.length === 0) return [];

    const uniqueIds = Array.from(new Set(productIds)).slice(0, 6);
    const products = await prisma.product.findMany({
      where: { id: { in: uniqueIds } },
      include: productInclude,
    });

    const seriesMap = await loadDailySeries(products.map((p) => p.id), { days: 90 });

    // Preserve the original order of requested IDs
    const cardMap = new Map<string, ProductCard>();
    for (const p of products) {
      cardMap.set(p.id, toProductCard(p, seriesMap.get(p.id)));
    }

    const cards: ProductCard[] = [];
    for (const id of uniqueIds) {
      const c = cardMap.get(id);
      if (c) cards.push(c);
    }
    return cards;
  }

  /**
   * Generates intelligent follow-up prompt suggestions based on context.
   */
  static generateFollowUps(intent: string, products: ProductCard[], query: string): string[] {
    const suggestions: string[] = [];

    if (products.length >= 2) {
      suggestions.push(`Compare ${products[0].name.split(' ')[0]} vs ${products[1].name.split(' ')[0]}`);
      suggestions.push(`Which has better battery life and cameras?`);
      suggestions.push(`Show me price drop predictions for both`);
    } else if (products.length === 1) {
      const p = products[0];
      suggestions.push(`Should I buy the ${p.brand} ${p.name.split(' ')[0]} now or wait for a sale?`);
      suggestions.push(`Show cheaper alternatives to ${p.name.split(' ')[0]}`);
      suggestions.push(`What is its historical lowest price?`);
    } else if (/phone|mobile/i.test(query)) {
      suggestions.push(`Best camera phone under ₹30,000`);
      suggestions.push(`Snapdragon vs MediaTek Dimensity processors`);
      suggestions.push(`Phones with highest discounts right now`);
    } else if (/laptop/i.test(query)) {
      suggestions.push(`Best laptop for programming and ML under ₹80,000`);
      suggestions.push(`Is 16GB RAM necessary for software development?`);
      suggestions.push(`OLED vs IPS display laptops`);
    } else {
      suggestions.push(`Show today's best electronics deals`);
      suggestions.push(`Best smartphones under ₹25,000`);
      suggestions.push(`Best value headphones under ₹5,000`);
    }

    return suggestions.slice(0, 3);
  }
}

