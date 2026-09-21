import type { Config } from './config.js';
import type { UnifiDirectory } from './domain.js';

export class UnifiClient implements UnifiDirectory {
  private readonly cache = new Map<string, string | null>();
  constructor(private readonly config: Config) {}
  async emailForUser(userId: string): Promise<string | null> {
    if (this.cache.has(userId)) return this.cache.get(userId) ?? null;
    const base = this.config.UNIFI_BASE_URL.replace(/\/$/, ''), host = base.replace(/:\d+$/, '');
    const urls = [...new Set([
      `${base}/proxy/access/api/v2/users`,
      `${base}/proxy/access/integration/v1/developer/users/${userId}`,
      `${base}/proxy/access/integration/v1/users/${userId}`,
      `${base}/api/v1/developer/users/${userId}`,
    ])];
    const headersList: HeadersInit[] = [
      { 'X-API-KEY': this.config.UNIFI_API_TOKEN, Accept: 'application/json' },
      { Authorization: `Bearer ${this.config.UNIFI_API_TOKEN}`, Accept: 'application/json' },
    ];
    let lastError = 'no matching email returned';
    for (const url of urls) for (const headers of headersList) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT_MS);
        try {
          const response = await fetch(url, { headers, signal: controller.signal });
        if (!response.ok) {
          lastError = `${response.status} ${response.statusText}`;
          continue;
        }
        const body = await response.json() as any, data = body?.data ?? body;
        if (Array.isArray(data)) {
          const user = data.find((u: any) => u.unique_id === userId || u.id === userId);
          if (user) {
            const email = String(user.email ?? user.user_email ?? user.upn ?? '').trim().toLowerCase();
            if (email && email.includes('@')) { this.cache.set(userId, email); return email; }
          }
          lastError = 'user not found in list';
        } else {
          const email = String(data?.email ?? data?.user_email ?? data?.upn ?? '').trim().toLowerCase();
          if (email && email.includes('@')) { this.cache.set(userId, email); return email; }
          lastError = 'response did not contain an email';
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      finally { clearTimeout(timeout); }
    }
    console.error(`[UniFi] Email lookup failed for user ${userId}: ${lastError}`);
    return null;
  }
}
