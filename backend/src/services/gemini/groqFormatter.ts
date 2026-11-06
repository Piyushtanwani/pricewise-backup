import { env } from '../../config/env';

export class GroqFormatter {
  /**
   * Refines raw AI shopping analysis text into clean, beautiful, readable Markdown.
   * Leverages Groq LPU speed (~200ms) purely for typography, layout, spacing, and bolding.
   * Strictly preserves 100% of the underlying factual data, prices, specifications, and verdicts.
   */
  public static async format(
    rawText: string,
    context?: { query?: string; intent?: string }
  ): Promise<string> {
    if (!rawText || !rawText.trim()) return rawText;
    if (!env.groq.apiKey) return rawText;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000); // 6-second safety timeout

      const systemPrompt = `
You are the PriceWise Markdown Formatting Specialist.
Your sole responsibility is to take the provided shopping intelligence analysis and format it into clean, polished, highly readable GitHub Flavored Markdown.

CRITICAL RULES:
1. STRICT TRUTH INTEGRITY: NEVER change, alter, remove, or fabricate any factual data, prices (₹), discount percentages, product names, retailer stores, technical specifications, or verdicts. Keep every single number and claim intact.
2. TYPOGRAPHY & LAYOUT:
   - Use clear markdown section headers (### Header) with blank lines between sections.
   - Use clean bullet points (•) for readability.
   - Highlight key figures in **bold** (e.g. **₹29,999**, **120Hz AMOLED**, **Snapdragon 8 Elite**).
   - Place the final purchase recommendation or verdict clearly at the bottom under a bold **Verdict:** line.
3. OUTPUT ONLY: Return strictly the formatted markdown text. Do NOT wrap in conversational filler like "Here is the formatted text" or "Sure, I have formatted it".
`.trim();

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.groq.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: env.groq.model || 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `User Shopping Query: "${context?.query || ''}"\n\nRaw AI Shopping Analysis to format:\n${rawText}`,
            },
          ],
          max_tokens: 1000,
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.ok) {
        const data = (await res.json()) as any;
        const formatted = data?.choices?.[0]?.message?.content?.trim();
        if (formatted && formatted.length > 20) {
          return formatted;
        }
      }
    } catch (err: any) {
      console.warn('[GroqFormatter] Formatting step bypassed, returning core text:', err?.message);
    }

    // Seamless fallback to original text if Groq format call fails or times out
    return rawText;
  }
}

