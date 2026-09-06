import { config } from '../config.js';
import type { UnifiUser } from '../types/unifi.types.js';

export class UnifiService {
  private userCache: Map<string, UnifiUser> = new Map();

  public async getUser(userId: string): Promise<UnifiUser | null> {
    if (this.userCache.has(userId)) {
      return this.userCache.get(userId)!;
    }

    if (!config.UNIFI_BASE_URL || !config.UNIFI_API_TOKEN) {
      return null;
    }

    const rawBase = config.UNIFI_BASE_URL.replace(/\/$/, '');
    const cleanHost = rawBase.replace(/:\d+$/, '');
    const candidateUrls = [
      `${rawBase}/api/v1/developer/users/${userId}`,
      `${cleanHost}:12445/api/v1/developer/users/${userId}`,
      `${rawBase}/proxy/access/api/v2/users/${userId}`,
      `${rawBase}/proxy/access/integration/v1/users/${userId}`,
    ];

    for (const url of [...new Set(candidateUrls)]) {
      const headerOptions: Record<string, string>[] = [
        { Authorization: `Bearer ${config.UNIFI_API_TOKEN}`, Accept: 'application/json' },
        { 'X-API-KEY': config.UNIFI_API_TOKEN, Accept: 'application/json' },
      ];

      for (const headers of headerOptions) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500);

          const response = await fetch(url, {
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (response.ok) {
            const result = (await response.json()) as any;
            const data = result.data || result;
            const user: UnifiUser = {
              id: data.id || userId,
              first_name: data.first_name,
              last_name: data.last_name,
              full_name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
              email: data.email || data.user_email || data.upn,
            };

            if (user.email) {
              this.userCache.set(userId, user);
            }

            return user;
          }
        } catch {}
      }
    }

    return null;
  }

  public clearCache(): void {
    this.userCache.clear();
  }
}

export const unifiService = new UnifiService();
