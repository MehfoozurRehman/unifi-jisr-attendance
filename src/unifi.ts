import { Agent, fetch } from 'undici';
import type { Config } from './config.js';
import type { Probe, UnifiDirectory } from './domain.js';

// UniFi returns both `email` (frequently an empty string) and `user_email`; take the first real address.
export const pickEmail = (data: any): string => {
  for (const value of [data?.user_email, data?.email, data?.upn]) {
    const email = String(value ?? '').trim().toLowerCase();
    if (email.includes('@')) return email;
  }
  return '';
};

const PROBE_PAGE_SIZE = 1000, PROBE_MAX_PAGES = 50;

export class UnifiClient implements UnifiDirectory {
  private readonly cache = new Map<string, string | null>();
  private readonly dispatcher: Agent | undefined;
  constructor(private readonly config: Config) {
    this.dispatcher = config.UNIFI_IGNORE_SSL ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
  }
  /** Health check: can we read the UniFi user list, and which users have no email (their taps cannot reach Jisr)? */
  async probe(): Promise<Probe & { users: number | null; withoutEmail: string[] }> {
    const host = this.config.UNIFI_BASE_URL.replace(/\/$/, '').replace(/:\d+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT_MS);
    try {
      const list: any[] = [];
      for (let page = 1; page <= PROBE_MAX_PAGES; page++) {
        const response = await fetch(`${host}:12445/api/v1/developer/users?page_num=${page}&page_size=${PROBE_PAGE_SIZE}`, { headers: { Authorization: `Bearer ${this.config.UNIFI_API_TOKEN}`, Accept: 'application/json' }, signal: controller.signal, ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}) });
        if (!response.ok) return { ok: false, status: response.status, message: response.status === 401 || response.status === 403 ? 'notAuthorized' : 'httpError', users: null, withoutEmail: [] };
        const body = await response.json().catch(() => null) as any;
        // A 200 without a user list is a failure, not an empty directory.
        if (!Array.isArray(body?.data)) return { ok: false, status: response.status, message: 'invalidResponse', users: null, withoutEmail: [] };
        list.push(...body.data);
        const total = Number(body?.pagination?.total);
        if (!body.data.length || (Number.isFinite(total) ? list.length >= total : body.data.length < PROBE_PAGE_SIZE)) break;
      }
      // Only active people matter; UniFi keeps deactivated users in the list.
      const active = list.filter((u: any) => !u.status || String(u.status).toUpperCase() === 'ACTIVE');
      const withoutEmail = active.filter((u: any) => !pickEmail(u)).map((u: any) => String(u.full_name || `${u.first_name ?? ''} ${u.last_name ?? ''}`).trim() || String(u.id));
      return { ok: true, status: 200, message: 'ok', users: active.length, withoutEmail };
    } catch (error) {
      return { ok: false, status: null, message: controller.signal.aborted ? 'timeout' : error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error), users: null, withoutEmail: [] };
    } finally { clearTimeout(timeout); }
  }
  async emailForUser(userId: string): Promise<string | null> {
    if (this.cache.has(userId)) return this.cache.get(userId) ?? null;
    const base = this.config.UNIFI_BASE_URL.replace(/\/$/, ''), host = base.replace(/:\d+$/, '');
    const urls = [...new Set([
      `${host}:12445/api/v1/developer/users/${userId}`,
      `${base}/api/v1/developer/users/${userId}`,
      `${base}/proxy/access/api/v2/users`,
      `${base}/proxy/access/integration/v1/developer/users/${userId}`,
      `${base}/proxy/access/integration/v1/users/${userId}`,
    ])];
    const headersList: Record<string, string>[] = [
      { Authorization: `Bearer ${this.config.UNIFI_API_TOKEN}`, Accept: 'application/json' },
      { 'X-API-KEY': this.config.UNIFI_API_TOKEN, Accept: 'application/json' },
    ];
    let lastError = 'no matching email returned';
    for (const url of urls) for (const headers of headersList) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, { headers, signal: controller.signal, ...(this.dispatcher ? { dispatcher: this.dispatcher } : {}) });
        if (!response.ok) {
          lastError = `${url} -> ${response.status} ${response.statusText}`;
          continue;
        }
        const body = await response.json() as any, data = body?.data ?? body;
        const user = Array.isArray(data) ? data.find((u: any) => u.unique_id === userId || u.id === userId) : data;
        if (!user) { lastError = `${url} -> user not found in list`; continue; }
        const email = pickEmail(user);
        if (email) { this.cache.set(userId, email); return email; }
        // The user exists but has no address in UniFi; the other endpoints would return the same record.
        console.error(`[UniFi] User ${userId} (${user.full_name ?? user.name ?? 'unknown'}) has no email set in UniFi`);
        return null;
      } catch (error) {
        lastError = `${url} -> ${error instanceof Error ? error.message : String(error)}`;
      }
      finally { clearTimeout(timeout); }
    }
    console.error(`[UniFi] Email lookup failed for user ${userId}: ${lastError}`);
    return null;
  }
}
