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

    try {
      const url = `${config.UNIFI_BASE_URL.replace(/\/$/, '')}/api/v1/developer/users/${userId}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.UNIFI_API_TOKEN}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.warn(`[UniFi] Failed to fetch user ${userId}: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = (await response.json()) as any;
      const user: UnifiUser = {
        id: data.id || userId,
        first_name: data.first_name,
        last_name: data.last_name,
        full_name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
        email: data.email || data.user_email,
      };

      if (user.email) {
        this.userCache.set(userId, user);
      }

      return user;
    } catch (error) {
      console.error(`[UniFi] Error fetching user ${userId}:`, error);
      return null;
    }
  }

  public clearCache(): void {
    this.userCache.clear();
  }
}

export const unifiService = new UnifiService();
