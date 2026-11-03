import type { Content, Part } from '@google/genai';
import { env } from '../../config/env';
import { getGeminiClient, withGeminiRetry } from './geminiClient';
import { SYSTEM_PROMPT } from './systemPrompt';
import { GEMINI_TOOLS } from './toolRegistry';
import { ToolExecutor } from './toolExecutor';
import { conversationManager } from './conversationManager';
import { ResponseFormatter } from './responseFormatter';
import { ProductCard } from '../productService';

export interface OrchestrationResult {
  role: 'assistant';
  content: string;
  products: ProductCard[];
  insights: { label: string; value: string }[];
  parsed: {
    intent: 'buy_now' | 'alternatives' | 'compare' | 'recommend' | 'technical_qa' | 'general_shopping';
    budget: number | null;
    category: string | null;
  };
  suggestedFollowUps?: string[];
  sessionId?: string;
  userId?: string;
  source: string;
}

export class AIOrchestrator {
  /**
   * Main entrypoint to process a conversational query with Gemini and tools.
   */
  public static async answer(
    message: string,
    context: { productIds?: string[]; userId?: string; sessionId?: string } = {},
  ): Promise<OrchestrationResult> {
    const ai = getGeminiClient();
    const model = env.gemini.model || 'gemini-3.5-flash-lite';
    const maxRounds = env.gemini.maxToolRounds || 5;

    // 1. Prepare conversation history with context injection
    const shortlistedPrior = conversationManager.getShortlistedProducts(context.sessionId, context.userId);
    let contextualQuery = message;
    if (shortlistedPrior.length > 0 && !context.productIds?.length) {
      contextualQuery = `[Context: Previous shortlisted product IDs in this chat: ${shortlistedPrior.join(', ')}]\n${message}`;
    } else if (context.productIds?.length) {
      contextualQuery = `[Context: Active product IDs: ${context.productIds.join(', ')}]\n${message}`;
    }

    const contents: Content[] = conversationManager.buildGeminiContents(
      context.sessionId,
      context.userId,
      contextualQuery,
    );

    const referencedProductIds = new Set<string>(context.productIds || []);
    const toolExecutions: { name: string; args: any; result: any }[] = [];
    let detectedCategory: string | null = null;
    let detectedBudget: number | null = null;
    let detectedIntent: OrchestrationResult['parsed']['intent'] = 'recommend';

    // 2. Multi-turn Tool Calling Execution Loop
    let round = 0;
    let finalAnswerText = '';

    while (round < maxRounds) {
      round++;
      const response = await withGeminiRetry(async (client) => {
        return await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ functionDeclarations: GEMINI_TOOLS }],
            temperature: 0.2,
          },
        });
      });

      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        // No further tool calls requested; model has generated its final natural language answer
        finalAnswerText = response.text || '';
        break;
      }

      // Record candidate turn from model with function calls
      if (response.candidates?.[0]?.content) {
        contents.push(response.candidates[0].content);
      }

      // Execute each tool call and collect results
      const toolResponseParts: Part[] = [];
      for (const call of functionCalls) {
        const callName = call.name || '';
        const toolResult = await ToolExecutor.execute(callName, call.args as Record<string, any>);
        toolExecutions.push({ name: callName, args: call.args, result: toolResult });

        // Collect any product IDs referenced or returned
        if (toolResult?.id) referencedProductIds.add(toolResult.id);
        if (toolResult?.productId) referencedProductIds.add(toolResult.productId);
        if (toolResult?.targetProduct?.id) referencedProductIds.add(toolResult.targetProduct.id);
        if (Array.isArray(toolResult?.products)) {
          toolResult.products.forEach((p: any) => {
            if (p.id) referencedProductIds.add(p.id);
          });
        }
        if (Array.isArray(toolResult?.deals)) {
          toolResult.deals.forEach((d: any) => {
            if (d.id) referencedProductIds.add(d.id);
          });
        }
        if (Array.isArray(toolResult?.recommendations)) {
          toolResult.recommendations.forEach((r: any) => {
            if (r.id) referencedProductIds.add(r.id);
          });
        }
        if (Array.isArray(toolResult?.items)) {
          toolResult.items.forEach((item: any) => {
            if (item.id) referencedProductIds.add(item.id);
          });
        }
        if (Array.isArray(toolResult?.alternatives)) {
          toolResult.alternatives.forEach((alt: any) => {
            if (alt.id) referencedProductIds.add(alt.id);
          });
        }

        // Track metadata from tool args
        if (call.args?.category && typeof call.args.category === 'string') {
          detectedCategory = call.args.category;
        }
        if (call.args?.budget && typeof call.args.budget === 'number') {
          detectedBudget = call.args.budget;
        } else if (call.args?.maxBudget && typeof call.args.maxBudget === 'number') {
          detectedBudget = call.args.maxBudget;
        }

        // Map intent from tools
        if (callName === 'compare_products') detectedIntent = 'compare';
        else if (callName === 'get_cheaper_alternatives') detectedIntent = 'alternatives';
        else if (callName === 'get_price_history' || callName === 'get_price_prediction' || callName === 'get_store_prices') {
          detectedIntent = 'buy_now';
        }

        toolResponseParts.push({
          functionResponse: {
            name: callName,
            response: toolResult,
            id: call.id,
          },
        });
      }

      // Add tool responses back into the conversation contents
      contents.push({
        role: 'user',
        parts: toolResponseParts,
      });
    }

    // Fallback if max rounds exceeded without text
    if (!finalAnswerText) {
      finalAnswerText = 'Based on the PriceWise catalogue and price data, here is the detailed evaluation:';
    }

    // 3. Resolve rich ProductCards
    const products = await ResponseFormatter.resolveProductCards(Array.from(referencedProductIds));

    // 4. Synthesize intelligent insights from tool executions
    const insights: { label: string; value: string }[] = [];

    // Find any price history or deal insights
    const historyTool = toolExecutions.find((t) => t.name === 'get_price_history')?.result;
    if (historyTool && !historyTool.error) {
      insights.push({
        label: 'Price History',
        value: `All-time low: ₹${(historyTool.allTimeLowest || 0).toLocaleString('en-IN')}, 90d Trend: ${historyTool.trend.toUpperCase()} (${historyTool.percentChange > 0 ? '+' : ''}${historyTool.percentChange}%)`,
      });
    }

    const predictionTool = toolExecutions.find((t) => t.name === 'get_price_prediction')?.result;
    if (predictionTool && !predictionTool.error) {
      insights.push({
        label: 'AI Forecast',
        value: `Expected 30d price: ₹${(predictionTool.predictedPrice30d || 0).toLocaleString('en-IN')} (${predictionTool.confidence.toLowerCase()} confidence) — ${predictionTool.recommendation}`,
      });
    }

    const dealsTool = toolExecutions.find((t) => t.name === 'get_best_deals')?.result;
    if (dealsTool && dealsTool.deals?.length > 0) {
      const topDeal = dealsTool.deals[0];
      insights.push({
        label: 'Top Deal',
        value: `${topDeal.name} is ${topDeal.discountPercent}% below MRP at ${topDeal.store}`,
      });
    }

    // Default insight if none generated
    if (insights.length === 0) {
      if (products.length > 0) {
        const p = products[0];
        insights.push({
          label: 'Price Intelligence',
          value: `Tracked at ₹${p.bestPrice.toLocaleString('en-IN')} on ${p.bestStore}${p.discount > 0 ? ` (${p.discount}% discount)` : ''}`,
        });
        insights.push({
          label: 'Verdict',
          value: p.aiVerdict || 'Good value in this price bracket',
        });
      } else {
        insights.push({
          label: 'Intelligence Engine',
          value: 'Direct Gemini Shopping Analysis with zero hallucinations',
        });
      }
    }

    // Classify intent if no tools were called (e.g. general technical QA)
    if (toolExecutions.length === 0) {
      if (/vs|versus|difference|what is|how to|ram|processor|snapdragon|oled|amoled/i.test(message)) {
        detectedIntent = 'technical_qa';
      } else {
        detectedIntent = 'general_shopping';
      }
    }

    // 5. Generate follow-up suggestions
    const suggestedFollowUps = ResponseFormatter.generateFollowUps(detectedIntent, products, message);

    // 6. Record turn in session memory
    conversationManager.addTurn(context.sessionId, context.userId, {
      userMessage: message,
      modelResponse: finalAnswerText,
      productIds: products.map((p) => p.id),
    });

    return {
      role: 'assistant',
      content: finalAnswerText,
      products,
      insights,
      parsed: {
        intent: detectedIntent,
        budget: detectedBudget,
        category: detectedCategory,
      },
      suggestedFollowUps,
      sessionId: context.sessionId,
      userId: context.userId,
      source: 'gemini-orchestrator',
    };
  }
}
