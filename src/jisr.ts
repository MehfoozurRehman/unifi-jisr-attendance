import type { Config } from './config.js';
import type { Confirmation, Employee, JisrGateway, Probe, Punch, Submission } from './domain.js';

const text = (value: unknown) => typeof value === 'string' ? value : '';
const wallTime = (instant: number, timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(instant)).replace(',', '');
const storedTime = (value: string, timezone: string) => {
  const source = value.trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(source) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(source)) return source.slice(0, 19).replace('T', ' ');
  const instant = Date.parse(source);
  return Number.isFinite(instant) ? wallTime(instant, timezone) : '';
};

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
        // Department and manager field names are not confirmed against the live Jisr API yet; several common shapes are accepted.
        const department = text(row.department?.name_en ?? row.department?.name ?? row.department_name ?? row.department).trim() || null;
        const managerEmail = text(row.line_manager?.email ?? row.manager?.email ?? row.manager_email ?? row.line_manager_email ?? row.direct_manager?.email).trim() || null;
        if (id && code && name) employees.push({ id, code, name, email: text(row.email ?? row.work_email).trim() || null, active: row.is_active !== false && row.active !== false && row.status !== 'inactive', department, managerEmail });
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
  /** Read-only checks for the health panel: sign-in, then one small read of each API the middleware uses. Sends nothing. */
  async probe(): Promise<{ auth: Probe; employees: Probe; attendance: Probe }> {
    const skipped: Probe = { ok: false, status: null, message: 'skipped' };
    // fetch reports "fetch failed"; the cause says why (refused, DNS, certificate, timeout).
    const failure = (error: unknown): Probe => ({ ok: false, status: null, message: error instanceof Error ? (error.name === 'AbortError' ? 'timeout' : error.cause instanceof Error ? error.cause.message : error.message) : String(error) });
    // Its own sign-in, so a probe never replaces the token the worker is using.
    let token = '';
    try {
      const { response, body } = await this.request('/openapi/v1/auth', { method: 'POST', headers: { 'Content-Type': 'application/json', slug: this.config.JISR_SLUG, 'api-key': this.config.JISR_API_KEY, secret: this.config.JISR_API_SECRET, 'api-version': '1', source: 'open_api' } });
      if (!response.ok || !body?.success || !text(body.data)) return { auth: { ok: false, status: response.status, message: 'authFailed' }, employees: skipped, attendance: skipped };
      token = body.data;
    } catch (error) { return { auth: failure(error), employees: skipped, attendance: skipped }; }
    const read = async (path: string): Promise<Probe> => {
      try {
        const { response, body } = await this.request(path, { headers: { ...this.headers(), 'Access-Token': token } });
        if (response.ok && body?.success !== false) return { ok: true, status: response.status, message: 'ok' };
        return { ok: false, status: response.status, message: response.status === 403 ? 'notAuthorized' : text(body?.error) || 'httpError' };
      } catch (error) { return failure(error); }
    };
    const now = Date.now(), from = encodeURIComponent(new Date(now - 3_600_000).toISOString()), to = encodeURIComponent(new Date(now).toISOString());
    const [employees, attendance] = await Promise.all([
      read('/openapi/v1/employees?rpp=1&page=1'),
      read(`/openapi/v1/attendance_logs?status=success&from=${from}&to=${to}&limit=1&page=1`),
    ]);
    return { auth: { ok: true, status: 200, message: 'ok' }, employees, attendance };
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
        const sameInstant = Number.isFinite(actual) && Number.isFinite(expected) && Math.floor(actual / 60_000) === Math.floor(expected / 60_000);
        const sameRiyadhTime = storedTime(text(found.punch_time), this.config.TIMEZONE) === wallTime(expected, this.config.TIMEZONE);
        if (!sameInstant && !sameRiyadhTime) return { outcome: 'failed', message: 'Jisr stored a different punch time; manual review required', response: found };
        return { outcome: 'confirmed', message: 'Confirmed by Jisr with matching employee and minute', response: found };
      }
      if (found) return { outcome: 'failed', message: text(found.error) || 'Jisr processing failed', response: found };
    }
    return { outcome: 'pending', message: 'Awaiting Jisr processing confirmation' };
  }
}
