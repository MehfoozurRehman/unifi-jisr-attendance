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
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'UniFi-Jisr-Integration/1.0',
      Authorization: `Bearer ${config.JISR_API_KEY}`,
      'api-key': config.JISR_API_KEY,
      'api-secret': config.JISR_API_SECRET,
      'client-id': config.JISR_API_KEY,
      'client-secret': config.JISR_API_SECRET,
    };
  }

  public async refreshEmployees(): Promise<void> {
    const candidateBases = [
      this.baseUrl,
      'https://apis.jisr.net/api',
      'https://api.jisr.net.sa/api',
      'https://apis.jisr.net/api/v1',
      'https://api.jisr.net.sa/api/v1',
    ];

    console.log('[Jisr] Auto-syncing employee list from Jisr...');

    for (const base of [...new Set(candidateBases)]) {
      try {
        const url = `${base}/employees?status=active&limit=2000`;
        const response = await fetch(url, { headers: this.getHeaders() });

        if (response.ok) {
          const result = (await response.json()) as any;
          const employees: JisrEmployee[] = Array.isArray(result.data)
            ? result.data
            : Array.isArray(result)
            ? result
            : [];

          if (employees.length > 0) {
            this.baseUrl = base.replace(/\/employees.*$/, '');
            this.employeeCache.clear();
            for (const emp of employees) {
              if (emp.email) {
                this.employeeCache.set(emp.email.toLowerCase().trim(), emp);
              }
            }
            this.lastCacheRefresh = Date.now();
            console.log(`[Jisr] ✅ Successfully discovered base "${this.baseUrl}" and cached ${this.employeeCache.size} employees.`);
            return;
          }
        }
      } catch {}
    }

    console.warn('[Jisr] ⚠️ Could not fetch employee list from candidate endpoints. Webhook punches will still attempt on-the-fly lookup.');
  }

  public async getEmployeeByName(fullName: string): Promise<JisrEmployee | null> {
    const cleanName = fullName.toLowerCase().trim();

    if (Date.now() - this.lastCacheRefresh > this.cacheTtlMs || this.employeeCache.size === 0) {
      await this.refreshEmployees();
    }

    for (const emp of this.employeeCache.values()) {
      const empName = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase().trim();
      if (empName && (empName === cleanName || empName.includes(cleanName) || cleanName.includes(empName))) {
        return emp;
      }
    }

    for (const candidateBase of ['https://api.jisr.net.sa/api', 'https://apis.jisr.net/api']) {
      try {
        const response = await fetch(`${candidateBase}/employees?name=${encodeURIComponent(cleanName)}`, {
          headers: this.getHeaders(),
        });
        if (response.ok) {
          const result = (await response.json()) as any;
          const list = Array.isArray(result.data) ? result.data : Array.isArray(result) ? result : [];
          if (list.length > 0) {
            return list[0];
          }
        }
      } catch {}
    }

    return null;
  }

  public async getEmployeeByEmail(email: string): Promise<JisrEmployee | null> {
    const normalizedEmail = email.toLowerCase().trim();

    if (Date.now() - this.lastCacheRefresh > this.cacheTtlMs || this.employeeCache.size === 0) {
      await this.refreshEmployees();
    }

    const cached = this.employeeCache.get(normalizedEmail);
    if (cached) return cached;

    for (const candidateBase of ['https://api.jisr.net.sa/api', 'https://apis.jisr.net/api']) {
      try {
        const response = await fetch(`${candidateBase}/employees?email=${encodeURIComponent(normalizedEmail)}`, {
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
      } catch {}
    }

    return null;
  }

  public async logAttendance(payload: JisrAttendanceLogPayload, retries = 3): Promise<JisrPunchResponse> {
    const candidateUrls = [
      `${this.baseUrl}/attendance/logs`,
      'https://api.jisr.net.sa/api/attendance/logs',
      'https://apis.jisr.net/api/attendance/logs',
      'https://api.jisr.net.sa/api/v1/attendance/logs',
      'https://apis.jisr.net/api/v1/attendance/logs',
    ];

    for (const endpoint of [...new Set(candidateUrls)]) {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(`[Jisr] Attempting punch at ${endpoint} for ${payload.employee_id} (Attempt ${attempt}/${retries})`);
          
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
            console.log(`[Jisr] ✅ Successfully recorded punch for employee ${payload.employee_id} at ${endpoint}`);
            this.baseUrl = endpoint.replace(/\/attendance\/logs.*$/, '');
            return {
              success: true,
              message: 'Punch logged successfully',
              data: responseBody,
            };
          }

          if (response.status === 404) {
            break;
          }

          if ((response.status >= 500 || response.status === 429) && attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`[Jisr] Temporary server error (HTTP ${response.status}), retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          console.error(`[Jisr] ❌ Failed to record punch at ${endpoint} (HTTP ${response.status}):`, responseBody);
        } catch (err: any) {
          if (attempt >= retries) {
            console.error(`[Jisr] Network error at ${endpoint}:`, err.message);
          }
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
