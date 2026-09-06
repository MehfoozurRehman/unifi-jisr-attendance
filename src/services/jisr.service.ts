import { config } from '../config.js';
import type { JisrEmployee, JisrAttendanceLogPayload, JisrPunchResponse } from '../types/jisr.types.js';

export class JisrService {
  private baseUrl: string;
  private employeeCache: Map<string, JisrEmployee> = new Map();
  private lastCacheRefresh = 0;
  private cacheTtlMs = 10 * 60 * 1000;

  constructor() {
    if (config.JISR_CUSTOM_BASE_URL) {
      this.baseUrl = config.JISR_CUSTOM_BASE_URL.replace(/\/$/, '');
    } else {
      this.baseUrl =
        config.JISR_HOST_TYPE === 'local'
          ? 'https://api.jisr.net.sa/api'
          : 'https://apis.jisr.net/api';
    }
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${config.JISR_API_KEY}`,
      'api-key': config.JISR_API_KEY,
      'api-secret': config.JISR_API_SECRET,
      'client-id': config.JISR_API_KEY,
      'client-secret': config.JISR_API_SECRET,
    };
  }

  public async refreshEmployees(): Promise<void> {
    try {
      console.log('[Jisr] Auto-syncing employee list from Jisr...');
      const response = await fetch(`${this.baseUrl}/employees?status=active&limit=2000`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.warn(`[Jisr] Could not fetch employee list (HTTP ${response.status}). Will retry next time.`);
        return;
      }

      const result = (await response.json()) as any;
      const employees: JisrEmployee[] = Array.isArray(result.data)
        ? result.data
        : Array.isArray(result)
        ? result
        : [];

      if (employees.length > 0) {
        this.employeeCache.clear();
        for (const emp of employees) {
          if (emp.email) {
            this.employeeCache.set(emp.email.toLowerCase().trim(), emp);
          }
        }
        this.lastCacheRefresh = Date.now();
        console.log(`[Jisr] Auto-cached ${this.employeeCache.size} employees in memory.`);
      }
    } catch (err: any) {
      console.warn('[Jisr] Background refresh warning:', err.message);
    }
  }

  public async getEmployeeByEmail(email: string): Promise<JisrEmployee | null> {
    const normalizedEmail = email.toLowerCase().trim();

    if (Date.now() - this.lastCacheRefresh > this.cacheTtlMs || this.employeeCache.size === 0) {
      await this.refreshEmployees();
    }

    const cached = this.employeeCache.get(normalizedEmail);
    if (cached) return cached;

    try {
      const response = await fetch(`${this.baseUrl}/employees?email=${encodeURIComponent(normalizedEmail)}`, {
        headers: this.getHeaders(),
      });
      if (response.ok) {
        const result = (await response.json()) as any;
        const list = Array.isArray(result.data) ? result.data : Array.isArray(result) ? result : [];
        if (list.length > 0) {
          const emp = list[0];
          this.employeeCache.set(normalizedEmail, emp);
          return emp;
        }
      }
    } catch (err: any) {
      console.warn(`[Jisr] Direct lookup failed for ${normalizedEmail}:`, err.message);
    }

    return null;
  }

  public async logAttendance(payload: JisrAttendanceLogPayload, retries = 3): Promise<JisrPunchResponse> {
    const endpoint = `${this.baseUrl}/attendance/logs`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[Jisr] Punching ${payload.punch_type.toUpperCase()} for ${payload.employee_id} (Attempt ${attempt}/${retries})`);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            employee_id: payload.employee_id,
            date_time: payload.timestamp,
            punch_type: payload.punch_type,
            type: payload.punch_type,
            device_id: payload.device_id || 'unifi-access',
            source: payload.source || 'UniFi Access Controller',
            note: payload.note,
          }),
        });

        const responseBody = await response.json().catch(() => ({}));

        if (response.ok) {
          console.log(`[Jisr] ✅ Successfully recorded punch for employee ${payload.employee_id}`);
          return {
            success: true,
            message: 'Punch logged successfully',
            data: responseBody,
          };
        }

        if ((response.status >= 500 || response.status === 429) && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`[Jisr] Temporary server error (HTTP ${response.status}), retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        console.error(`[Jisr] ❌ Failed to record punch (HTTP ${response.status}):`, responseBody);
        return {
          success: false,
          message: `HTTP ${response.status}: ${JSON.stringify(responseBody)}`,
          data: responseBody,
        };
      } catch (err: any) {
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`[Jisr] Network glitch, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
        } else {
          console.error('[Jisr] Network error posting punch after retries:', err.message);
          return {
            success: false,
            message: err.message || 'Network error',
          };
        }
      }
    }

    return {
      success: false,
      message: 'Failed to record punch after maximum retries',
    };
  }

  public getCacheSize(): number {
    return this.employeeCache.size;
  }
}

export const jisrService = new JisrService();
