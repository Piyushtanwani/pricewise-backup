import type { Content } from '@google/genai';

export interface ConversationTurn {
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  productIds?: string[];
  toolCalls?: any[];
}

interface SessionData {
  ownerKey: string; // userId or guest sessionId
  turns: ConversationTurn[];
  rawContents: Content[];
  shortlistedProductIds: string[];
  lastActive: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_TURNS_PER_SESSION = 14;

class ConversationManager {
  private sessions = new Map<string, SessionData>();

  private getSessionKey(sessionId?: string, userId?: string): string {
    if (userId) return `user:${userId}`;
    return sessionId ? `session:${sessionId}` : `anonymous:${Date.now()}`;
  }

  private sweepExpiredSessions(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.lastActive > SESSION_TTL_MS) {
        this.sessions.delete(key);
      }
    }
  }

  public getSession(sessionId?: string, userId?: string): SessionData {
    this.sweepExpiredSessions();
    const key = this.getSessionKey(sessionId, userId);
    let session = this.sessions.get(key);

    if (!session) {
      session = {
        ownerKey: key,
        turns: [],
        rawContents: [],
        shortlistedProductIds: [],
        lastActive: Date.now(),
      };
      this.sessions.set(key, session);
    } else {
      session.lastActive = Date.now();
    }

    return session;
  }

  public addTurn(
    sessionId: string | undefined,
    userId: string | undefined,
    turn: {
      userMessage: string;
      modelResponse: string;
      productIds?: string[];
    },
  ): void {
    const session = this.getSession(sessionId, userId);
    const now = Date.now();

    session.turns.push({
      role: 'user',
      text: turn.userMessage,
      timestamp: now,
    });

    session.turns.push({
      role: 'model',
      text: turn.modelResponse,
      timestamp: now,
      productIds: turn.productIds,
    });

    // Update shortlisted product IDs
    if (turn.productIds && turn.productIds.length > 0) {
      session.shortlistedProductIds = [
        ...turn.productIds,
        ...session.shortlistedProductIds.filter((id) => !turn.productIds!.includes(id)),
      ].slice(0, 10);
    }

    // Window pruning for long sessions
    if (session.turns.length > MAX_TURNS_PER_SESSION * 2) {
      session.turns = session.turns.slice(-MAX_TURNS_PER_SESSION * 2);
    }

    session.lastActive = now;
  }

  public getShortlistedProducts(sessionId?: string, userId?: string): string[] {
    const session = this.getSession(sessionId, userId);
    return [...session.shortlistedProductIds];
  }

  /**
   * Builds the conversation history formatted as Content[] for Gemini's generateContent
   */
  public buildGeminiContents(
    sessionId: string | undefined,
    userId: string | undefined,
    currentQuery: string,
  ): Content[] {
    const session = this.getSession(sessionId, userId);
    const contents: Content[] = [];

    // Add recent previous conversation turns
    for (const turn of session.turns.slice(-10)) {
      contents.push({
        role: turn.role,
        parts: [{ text: turn.text }],
      });
    }

    // Add the current user query
    contents.push({
      role: 'user',
      parts: [{ text: currentQuery }],
    });

    return contents;
  }

  public clearSession(sessionId?: string, userId?: string): void {
    const key = this.getSessionKey(sessionId, userId);
    this.sessions.delete(key);
  }
}

export const conversationManager = new ConversationManager();

