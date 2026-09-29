/** Minimal in-process TTL cache. Swap for Redis once more than one backend instance runs. */
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

  set(key: string, value: V): void {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

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
