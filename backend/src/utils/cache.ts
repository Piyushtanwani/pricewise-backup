import Redis from 'ioredis';
import { env } from '../config/env';

/** Minimal in-process TTL cache. Supports eviction, TTL expiration, and manual invalidation. */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, customTtlMs?: number): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    const ttl = typeof customTtlMs === 'number' && customTtlMs > 0 ? customTtlMs : this.ttlMs;
    this.entries.set(key, { value, expiresAt: Date.now() + ttl });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Distributed Redis Cache with seamless in-memory fallback.
 * Ensures real-time price comparisons can invalidate stale cache entries
 * or bypass cache during live refresh requests.
 */
class RedisCacheService {
  private redis: Redis | null = null;
  private memoryFallback = new TtlCache<string>(30 * 1000, 1000); // 30s default
  private isConnected = false;

  constructor() {
    const redisUrl = env.redisUrl || process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          retryStrategy(times) {
            if (times > 3) return null; // stop retrying after 3 attempts
            return Math.min(times * 500, 2000);
          },
        });

        this.redis.on('connect', () => {
          this.isConnected = true;
          console.info('[RedisCache] Connected to Redis cluster successfully.');
        });

        this.redis.on('error', (err) => {
          this.isConnected = false;
          // Silent warning so backend doesn't crash if Redis is unavailable
          console.warn('[RedisCache] Redis connection notice:', err?.message || err);
        });

        this.redis.connect().catch(() => {
          this.isConnected = false;
        });
      } catch (err: any) {
        console.warn('[RedisCache] Redis initialization skipped:', err?.message || err);
        this.redis = null;
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      if (this.isConnected && this.redis) {
        const raw = await this.redis.get(key);
        if (raw) return JSON.parse(raw) as T;
      }
    } catch {
      // Fallback on error
    }

    const fallback = this.memoryFallback.get(key);
    if (!fallback) return null;
    try {
      return JSON.parse(fallback) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = 30): Promise<void> {
    const serialized = JSON.stringify(value);

    // Always update memory fallback for immediate local read speed
    this.memoryFallback.set(key, serialized, ttlSeconds * 1000);

    try {
      if (this.isConnected && this.redis) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
      }
    } catch {
      // Memory fallback already recorded
    }
  }

  async del(key: string): Promise<void> {
    this.memoryFallback.delete(key);
    try {
      if (this.isConnected && this.redis) {
        await this.redis.del(key);
      }
    } catch {
      // Ignore
    }
  }

  /** Explicit cache-eviction alias for forced real-time refreshes */
  async evict(key: string): Promise<void> {
    return this.del(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    this.memoryFallback.clear();
    try {
      if (this.isConnected && this.redis) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
    } catch {
      // Ignore
    }
  }
}

export const livePriceCache = new RedisCacheService();

/** Serialises calls so that consecutive requests are at least `intervalMs` apart (provider TPS limits). */
export class Throttle {
  private queue: Promise<void> = Promise.resolve();
  private last = 0;

  constructor(private readonly intervalMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const wait = this.last + this.intervalMs - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.last = Date.now();
      return task();
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
