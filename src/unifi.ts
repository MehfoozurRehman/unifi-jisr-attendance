import type { Config } from './config.js';
import type { UnifiDirectory } from './domain.js';

export class UnifiClient implements UnifiDirectory {
  private readonly cache = new Map<string, string | null>();
  constructor(private readonly config: Config) {}
  async emailForUser(userId: string): Promise<string | null> {
    if (this.cache.has(userId)) return this.cache.get(userId) ?? null;
    const base = this.config.UNIFI_BASE_URL.replace(/\/$/, ''), host = base.replace(/:\d+$/, '');
    const urls = [...new Set([
      `${base}/api/v1/developer/users/${userId}`,
      `${host}:12445/api/v1/developer/users/${userId}`,
      `${base}/proxy/access/api/v2/users/${userId}`,
      `${base}/proxy/access/integration/v1/users/${userId}`,
    ])];
    const headersList: HeadersInit[] = [
      { Authorization: `Bearer ${this.config.UNIFI_API_TOKEN}`, Accept: 'application/json' },
      { 'X-API-KEY': this.config.UNIFI_API_TOKEN, Accept: 'application/json' },
    ];
    for (const url of urls) for (const headers of headersList) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, { headers, signal: controller.signal });
        if (!response.ok) continue;
        const body = await response.json() as any, data = body?.data ?? body;
        const email = String(data?.email ?? data?.user_email ?? data?.upn ?? '').trim().toLowerCase();
        if (email && email.includes('@')) { this.cache.set(userId, email); return email; }
      } catch {}
      finally { clearTimeout(timeout); }
    }
    this.cache.set(userId, null);
    return null;
  }
}
