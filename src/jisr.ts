import type { Config } from './config.js';
import type { Confirmation, Employee, JisrGateway, Punch, Submission } from './domain.js';

const text = (value: unknown) => typeof value === 'string' ? value : '';

export class JisrClient implements JisrGateway {
  private token = '';
  private tokenAt = 0;
  constructor(private config: Config, private fetcher: typeof fetch = fetch) {}
  private async request(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(`${this.config.JISR_BASE_URL}${path}`, { ...init, signal: controller.signal });
      const bodyText = await response.text();
      let body: any = null;
      try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = bodyText; }
      return { response, body };
    } finally { clearTimeout(timeout); }
  }
  async prepare() {
    if (this.token && Date.now() - this.tokenAt < 45 * 60_000) return;
    const { response, body } = await this.request('/openapi/v1/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', slug: this.config.JISR_SLUG, 'api-key': this.config.JISR_API_KEY, secret: this.config.JISR_API_SECRET, 'api-version': '1', source: 'open_api' } });
    if (!response.ok || !body?.success || !text(body.data)) throw new Error(`Jisr authentication failed (${response.status})`);
    this.token = body.data;
    this.tokenAt = Date.now();
  }
  private headers() { return { 'Access-Token': this.token, slug: this.config.JISR_SLUG, 'api-version': '1', source: 'open_api', 'Content-Type': 'application/json' }; }
  async employees(): Promise<Employee[]> {
    await this.prepare();
    const employees: Employee[] = [];
    for (let page = 1; page <= 100; page++) {
      const { response, body } = await this.request(`/openapi/v1/employees?rpp=100&page=${page}`, { headers: this.headers() });
      if (!response.ok || !body?.success) throw new Error(`Employee refresh failed (${response.status})`);
      const rows = body?.data?.employees ?? [];
      for (const row of rows) {
        const id = text(row.id ?? row.uuid), code = text(row.code ?? row.employee_code ?? row.emp_code), name = text(row.full_name_en ?? row.name ?? row.full_name ?? row.name_en);
        if (id && code && name) employees.push({ id, code, name, email: text(row.email ?? row.work_email).trim() || null, active: row.is_active !== false && row.active !== false && row.status !== 'inactive' });
      }
      if (!body?.data?.pagination?.next_page && rows.length < 100) break;
    }
    if (!employees.length) throw new Error('Jisr returned an empty employee directory');
    return employees;
  }
  async submit(punch: Punch): Promise<Submission> {
    const { response, body } = await this.request('/openapi/v1/attendance_logs', { method: 'POST', headers: this.headers(), body: JSON.stringify({ data: [punch] }) });
    if (response.ok && body?.success === true) return { outcome: 'accepted', message: 'Jisr accepted the punch for processing', response: body };
    if (response.status === 401) { this.token = ''; return { outcome: 'retry', message: 'Jisr authorization expired; retry scheduled', response: body }; }
    if (response.status === 408 || response.status === 429 || response.status >= 500) return { outcome: 'uncertain', message: `Jisr response ${response.status}; confirmation required before retry`, response: body };
    return { outcome: 'rejected', message: `Jisr rejected the punch (${response.status})`, response: body };
  }
  async confirm(punch: Punch): Promise<Confirmation> {
    await this.prepare();
    const from = encodeURIComponent(new Date(Date.parse(punch.punch_time) - 60_000).toISOString());
    const to = encodeURIComponent(new Date(Date.parse(punch.punch_time) + 60_000).toISOString());
    for (const status of ['success', 'failed']) {
      const { response, body } = await this.request(`/openapi/v1/attendance_logs?status=${status}&from=${from}&to=${to}&limit=100&page=1`, { headers: this.headers() });
      if (!response.ok || !body?.success) throw new Error(`Jisr confirmation failed (${response.status})`);
      const found = (body?.data?.punches ?? []).find((row: any) => String(row.clocking_id) === String(punch.id) && String(row.employee_code) === String(punch.emp_code));
      if (found && status === 'success') {
        const actual = Date.parse(text(found.punch_time));
        const expected = Date.parse(punch.punch_time);
        if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1_000) return { outcome: 'failed', message: 'Jisr stored a different punch time; manual review required', response: found };
        return { outcome: 'confirmed', message: 'Confirmed by Jisr with matching employee and time', response: found };
      }
      if (found) return { outcome: 'failed', message: text(found.error) || 'Jisr processing failed', response: found };
    }
    return { outcome: 'pending', message: 'Awaiting Jisr processing confirmation' };
  }
}
