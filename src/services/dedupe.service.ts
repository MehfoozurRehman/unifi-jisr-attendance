export class DedupeService {
  private cache: Map<string, number> = new Map();
  private windowMs: number;

  constructor(windowSeconds = 60) {
    this.windowMs = windowSeconds * 1000;
  }

  public isDuplicate(userIdentifier: string, eventTimestampMs: number = Date.now()): boolean {
    const key = userIdentifier.toLowerCase().trim();
    const lastTimestamp = this.cache.get(key);

    if (lastTimestamp && Math.abs(eventTimestampMs - lastTimestamp) < this.windowMs) {
      return true;
    }

    this.cache.set(key, eventTimestampMs);
    this.cleanup();
    return false;
  }

  private cleanup(): void {
    const now = Date.now();
    const expiry = this.windowMs * 2;
    for (const [key, ts] of this.cache.entries()) {
      if (now - ts > expiry) {
        this.cache.delete(key);
      }
    }
  }

  public clear(): void {
    this.cache.clear();
  }
}

export const dedupeService = new DedupeService();
