import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';

let aiInstance: GoogleGenAI | null = null;

export const getGeminiClient = (): GoogleGenAI => {
  if (!env.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in backend environment.');
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey: env.gemini.apiKey });
  }
  return aiInstance;
};

/**
 * Executes a call with retry logic for transient errors (rate limit 429, 503, network glitch).
 */
export async function withGeminiRetry<T>(
  operation: (ai: GoogleGenAI) => Promise<T>,
  options: { retries?: number; initialDelayMs?: number } = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const initialDelay = options.initialDelayMs ?? 1000;
  const ai = getGeminiClient();

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation(ai);
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code || (typeof err?.message === 'string' && err.message.includes('503') ? 503 : 0);
      const isTransient = status === 429 || status === 503 || (err?.message && /timeout|fetch failed|unavailable/i.test(err.message));

      if (attempt < retries && isTransient) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(`[GeminiClient] Transient error (attempt ${attempt + 1}/${retries + 1}). Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

