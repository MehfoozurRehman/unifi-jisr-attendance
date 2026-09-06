import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { config } from '../config.js';
import type { JisrEmployee, JisrAttendanceLogPayload, JisrPunchResponse } from '../types/jisr.types.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export class JisrService {
  private baseUrl: string;
  private employeeCache: Map<string, JisrEmployee> = new Map();
  private lastCacheRefresh = 0;
  private cacheTtlMs = 10 * 60 * 1000;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

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

  public async getAccessToken(): Promise<string | null> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const authBases = [
      'https://apis.jisr.net/api',
      this.baseUrl,
      'https://api.jisr.net.sa/api',
    ];

    for (const base of [...new Set(authBases)]) {
      try {
        const url = `${base}/openapi/v1/auth`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            slug: config.JISR_SLUG,
            'api-key': config.JISR_API_KEY,
            secret: config.JISR_API_SECRET,
            'api-version': '1',
            source: 'open_api',
          },
        });

        if (res.ok) {
          const body = (await res.json()) as any;
          if (body?.success && body?.data) {
            this.accessToken = body.data;
            this.baseUrl = base;
            this.tokenExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
            console.log(`[Jisr] ✅ Successfully authenticated session at ${base}`);
            return this.accessToken;
          }
        }
      } catch {}
    }

    return null;
  }

  public async refreshEmployees(): Promise<void> {
    const token = await this.getAccessToken();
    if (!token) {
      console.error('[Jisr] ❌ Cannot refresh employees: Failed to obtain session token');
      return;
    }

    console.log('[Jisr] Auto-syncing employee list from Jisr OpenAPI...');

    let page = 1;
    let fetchedEmployees: JisrEmployee[] = [];

    while (page <= 20) {
      try {
        const url = `${this.baseUrl}/openapi/v1/employees?rpp=100&page=${page}`;
        const response = await fetch(url, {
          headers: {
            'Access-Token': token,
            slug: config.JISR_SLUG,
            'api-version': '1',
            source: 'open_api',
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const result = (await response.json()) as any;
          const list: JisrEmployee[] = result?.data?.employees || [];
          if (list.length === 0) break;

          fetchedEmployees.push(...list);
          if (list.length < 100) break;
          page++;
        } else if (response.status === 401) {
          this.accessToken = null;
          break;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    if (fetchedEmployees.length > 0) {
      this.employeeCache.clear();
      for (const emp of fetchedEmployees) {
        if (emp.email) {
          this.employeeCache.set(emp.email.toLowerCase().trim(), emp);
        }
        if (emp.code) {
          this.employeeCache.set(`code:${emp.code.trim()}`, emp);
        }
        if (emp.full_name_en) {
          this.employeeCache.set(`name:${emp.full_name_en.toLowerCase().trim()}`, emp);
        }
        if (emp.full_name_ar) {
          this.employeeCache.set(`name_ar:${emp.full_name_ar.trim()}`, emp);
        }
      }
      this.lastCacheRefresh = Date.now();
      console.log(`[Jisr] ✅ Successfully cached ${fetchedEmployees.length} active employees.`);
    } else {
      console.warn('[Jisr] ⚠️ No employees retrieved from Jisr API.');
    }
  }

  public async getEmployeeByName(fullName: string): Promise<JisrEmployee | null> {
    const cleanName = fullName.toLowerCase().trim();

    if (Date.now() - this.lastCacheRefresh > this.cacheTtlMs || this.employeeCache.size === 0) {
      await this.refreshEmployees();
    }

    const exactMatch = this.employeeCache.get(`name:${cleanName}`);
    if (exactMatch) return exactMatch;

    for (const [key, emp] of this.employeeCache.entries()) {
      if (!key.startsWith('name:')) continue;
      const cachedName = key.replace('name:', '');
      if (cachedName === cleanName || cachedName.includes(cleanName) || cleanName.includes(cachedName)) {
        return emp;
      }
    }

    const cleanTokens = cleanName.split(/\s+/).filter((t) => t.length > 2);
    if (cleanTokens.length === 0) return null;

    let bestMatch: JisrEmployee | null = null;
    let maxScore = 0;

    const seenEmployees = new Set<string>();

    for (const emp of this.employeeCache.values()) {
      if (seenEmployees.has(emp.id)) continue;
      seenEmployees.add(emp.id);

      let score = 0;
      const en = (emp.full_name_en || '').toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const emailPrefix = email.split('@')[0];

      const enTokens = en.split(/\s+/).filter((t) => t.length > 1);
      const emailTokens = emailPrefix.split(/[._-]/).filter((t) => t.length > 1);

      for (const q of cleanTokens) {
        if (enTokens.some((e) => e === q || (e.length >= 4 && (e.includes(q) || q.includes(e))))) {
          score += 3;
        } else if (emailTokens.some((e) => e === q || (e.length >= 4 && (e.includes(q) || q.includes(e))))) {
          score += 3;
        } else if (en.includes(q) && q.length >= 4) {
          score += 2;
        } else if (email.includes(q) && q.length >= 4) {
          score += 2;
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestMatch = emp;
      }
    }

    return maxScore >= 3 ? bestMatch : null;
  }

  public async getEmployeeByEmail(email: string): Promise<JisrEmployee | null> {
    const normalizedEmail = email.toLowerCase().trim();

    if (Date.now() - this.lastCacheRefresh > this.cacheTtlMs || this.employeeCache.size === 0) {
      await this.refreshEmployees();
    }

    const cached = this.employeeCache.get(normalizedEmail);
    if (cached) return cached;

    const emailPrefix = normalizedEmail.split('@')[0];
    for (const [key, emp] of this.employeeCache.entries()) {
      if (!key.includes('@')) continue;
      if (key.startsWith(emailPrefix)) {
        return emp;
      }
    }

    return null;
  }

  public async logAttendance(payload: JisrAttendanceLogPayload, retries = 3): Promise<JisrPunchResponse> {
    let token = await this.getAccessToken();
    if (!token) {
      return {
        success: false,
        message: 'Could not obtain Jisr access token for punch',
      };
    }

    const empCode = payload.employee_code || payload.employee_id;
    const numericCode = Number(empCode);

    let parsedDay = dayjs(payload.timestamp);
    if (!parsedDay.isValid()) {
      const num = Number(payload.timestamp);
      parsedDay = !isNaN(num) && num > 0 ? (num > 1e11 ? dayjs(num) : dayjs.unix(num)) : dayjs();
    }
    const punchTimeStr = parsedDay.tz('Asia/Riyadh').format('YYYY-MM-DD HH:mm:ss');

    const punchId = Math.floor(Math.random() * 1000000000) + 1;
    const terminalSn = payload.device_id || 'UNIFI-ACCESS';

    const postBody = {
      data: [
        {
          terminal_sn: terminalSn,
          punch_time: punchTimeStr,
          id: punchId,
          emp_code: !isNaN(numericCode) ? numericCode : empCode,
        },
      ],
    };

    const endpoint = `${this.baseUrl}/openapi/v1/attendance_logs`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const currentToken = token;
        if (!currentToken) break;

        console.log(`[Jisr] Attempting punch at ${endpoint} for emp_code: ${empCode} (Attempt ${attempt}/${retries})`);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': currentToken,
            slug: config.JISR_SLUG,
            'api-version': '1',
            source: 'open_api',
          },
          body: JSON.stringify(postBody),
        });

        const responseBody = (await response.json().catch(() => ({}))) as any;

        if (response.ok && responseBody?.success) {
          console.log(`[Jisr] ✅ Successfully recorded punch for employee code ${empCode}`);
          return {
            success: true,
            message: responseBody.message || 'Creating punches on processing',
            data: responseBody,
          };
        }

        if (response.status === 401) {
          console.warn('[Jisr] Access token expired, re-authenticating...');
          this.accessToken = null;
          token = await this.getAccessToken();
          if (!token) break;
          continue;
        }

        if ((response.status >= 500 || response.status === 429) && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        console.error(`[Jisr] ❌ Failed to record punch (HTTP ${response.status}):`, responseBody);
        return {
          success: false,
          message: responseBody?.error || responseBody?.message || `HTTP ${response.status}`,
          data: responseBody,
        };
      } catch (err: any) {
        if (attempt >= retries) {
          console.error(`[Jisr] Network error logging punch:`, err.message);
          return {
            success: false,
            message: err.message,
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

function tokenMatchesStrongly(token: string, text: string): boolean {
  if (token.length < 4) return false;
  return text.includes(token);
}

export const jisrService = new JisrService();
